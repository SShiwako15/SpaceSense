using System.Diagnostics;

namespace SpaceSense.Api;

public sealed record AllocationEvent(
    string Id,
    string Title,
    DateTimeOffset Start,
    DateTimeOffset End,
    int Attendees,
    string[] RequiredFeatures,
    bool Accessible,
    int Priority);

public sealed record AllocationAssignment(
    string EventId,
    string EventTitle,
    string ResourceId,
    string ResourceName,
    DateTimeOffset Start,
    DateTimeOffset End,
    int Attendees,
    int Capacity,
    int SeatWaste,
    int Priority);

public sealed record AllocationUnassigned(string EventId, string EventTitle, string Reason);

public sealed record AllocationRoomUtilization(
    string ResourceId,
    string ResourceName,
    int Capacity,
    long ExistingMinutes,
    long AllocatedMinutes,
    long PlanningMinutes,
    double UtilizationPercent,
    double SeatFillPercent);

public sealed record AllocationSummary(
    int TotalEvents,
    int AssignedEvents,
    int UnassignedEvents,
    double AllocationRatePercent,
    double SeatFillPercent,
    double WastedSeatHours,
    double RoomTimeUtilizationPercent);

public sealed record AllocationPlanResult(
    AllocationAssignment[] Assignments,
    AllocationUnassigned[] Unassigned,
    AllocationRoomUtilization[] Rooms,
    AllocationSummary Summary,
    string Method);

/// <summary>
/// Builds a feasible, priority-aware room plan. A bounded backtracking search can
/// reassign earlier events; the result is not a proof of global optimality.
/// </summary>
public static class AllocationPlanner
{
    private const int MaximumSearchStates = 60_000;
    private const int MaximumSearchMilliseconds = 350;
    private const string MethodDescription =
        "Priority-aware bounded search; feasible plan, global optimum not guaranteed.";

    private sealed class PlanningItem
    {
        public required AllocationEvent Event { get; init; }
        public required int InputIndex { get; init; }
        public required int[] CandidateRooms { get; init; }
        public required long DurationMinutes { get; init; }
        public required long Weight { get; init; }
        public int ConflictDegree { get; set; }
    }

    public static AllocationPlanResult Plan(
        IEnumerable<Resource> resources,
        IEnumerable<Reservation> reservations,
        IReadOnlyList<AllocationEvent> events)
    {
        ArgumentNullException.ThrowIfNull(resources);
        ArgumentNullException.ThrowIfNull(reservations);
        ArgumentNullException.ThrowIfNull(events);

        // Equipment can be reserved through the ordinary booking flow, but is not
        // a physical room that can host an event.
        var rooms = resources
            .Where(resource => !string.Equals(resource.Type, "equipment", StringComparison.OrdinalIgnoreCase))
            .Where(resource => !string.IsNullOrWhiteSpace(resource.Id))
            .GroupBy(resource => resource.Id, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(resource => resource.Capacity)
            .ThenBy(resource => resource.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var activeReservations = reservations
            .Where(reservation => !IsInactive(reservation.Status) && reservation.End > reservation.Start)
            .GroupBy(reservation => reservation.ResourceId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.OrdinalIgnoreCase);

        var errors = new Dictionary<int, string>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var items = new List<PlanningItem>();
        var weightBase = (long)events.Count + 1;
        var weights = new long[6];
        weights[1] = 1;
        for (var priority = 2; priority <= 5; priority++)
        {
            weights[priority] = weights[priority - 1] * weightBase;
        }

        for (var index = 0; index < events.Count; index++)
        {
            var requested = events[index];
            if (requested is null)
            {
                errors[index] = "Event details are missing.";
                continue;
            }

            if (string.IsNullOrWhiteSpace(requested.Id))
            {
                errors[index] = "Event ID is required.";
                continue;
            }

            if (!seenIds.Add(requested.Id))
            {
                errors[index] = "Event ID must be unique in this plan.";
                continue;
            }

            if (string.IsNullOrWhiteSpace(requested.Title))
            {
                errors[index] = "Event title is required.";
                continue;
            }

            if (requested.End <= requested.Start)
            {
                errors[index] = "End time must be after start time.";
                continue;
            }

            if ((requested.End - requested.Start).TotalHours > 12)
            {
                errors[index] = "Events cannot exceed 12 hours.";
                continue;
            }

            if (requested.Attendees <= 0)
            {
                errors[index] = "Attendees must be greater than zero.";
                continue;
            }

            if (requested.Priority is < 1 or > 5)
            {
                errors[index] = "Priority must be between 1 and 5.";
                continue;
            }

            var matchingRooms = Enumerable.Range(0, rooms.Length)
                .Where(roomIndex => MeetsRequirements(rooms[roomIndex], requested))
                .ToArray();
            if (matchingRooms.Length == 0)
            {
                errors[index] = "No room matches the capacity, accessibility, and equipment requirements.";
                continue;
            }

            var candidates = matchingRooms
                .Where(roomIndex => !HasReservationConflict(
                    rooms[roomIndex].Id,
                    requested.Start,
                    requested.End,
                    activeReservations))
                .ToArray();
            if (candidates.Length == 0)
            {
                errors[index] = "Matching rooms are already reserved for this time.";
                continue;
            }

            items.Add(new PlanningItem
            {
                Event = requested,
                InputIndex = index,
                CandidateRooms = candidates,
                DurationMinutes = DurationMinutes(requested.Start, requested.End),
                Weight = weights[requested.Priority]
            });
        }

        foreach (var item in items)
        {
            item.ConflictDegree = items.Count(other =>
                !ReferenceEquals(item, other) &&
                Overlaps(item.Event.Start, item.Event.End, other.Event.Start, other.Event.End));
        }

        items.Sort((left, right) =>
        {
            var comparison = right.Event.Priority.CompareTo(left.Event.Priority);
            if (comparison != 0) return comparison;
            comparison = left.CandidateRooms.Length.CompareTo(right.CandidateRooms.Length);
            if (comparison != 0) return comparison;
            comparison = right.ConflictDegree.CompareTo(left.ConflictDegree);
            if (comparison != 0) return comparison;
            comparison = left.Event.Start.CompareTo(right.Event.Start);
            if (comparison != 0) return comparison;
            return string.Compare(left.Event.Id, right.Event.Id, StringComparison.OrdinalIgnoreCase);
        });

        var occupied = Enumerable.Range(0, rooms.Length).Select(_ => new List<int>()).ToArray();
        var current = Enumerable.Repeat(-1, items.Count).ToArray();
        var best = Enumerable.Repeat(-1, items.Count).ToArray();
        long bestScore = 0;
        long bestWasteMinutes = 0;

        // Start with a usable plan even if the bounded search reaches its limit.
        for (var index = 0; index < items.Count; index++)
        {
            var item = items[index];
            foreach (var roomIndex in item.CandidateRooms)
            {
                if (!CanPlace(item, occupied[roomIndex], items)) continue;
                best[index] = roomIndex;
                occupied[roomIndex].Add(index);
                bestScore += item.Weight;
                bestWasteMinutes += SeatWasteMinutes(item, rooms[roomIndex]);
                break;
            }
        }

        foreach (var assignments in occupied) assignments.Clear();

        var remainingWeight = new long[items.Count + 1];
        for (var index = items.Count - 1; index >= 0; index--)
        {
            remainingWeight[index] = remainingWeight[index + 1] + items[index].Weight;
        }

        var stopwatch = Stopwatch.StartNew();
        var visited = 0;

        void Search(int index, long score, long wasteMinutes)
        {
            if (visited++ >= MaximumSearchStates || stopwatch.ElapsedMilliseconds >= MaximumSearchMilliseconds)
            {
                return;
            }

            var maximumPossible = score + remainingWeight[index];
            if (maximumPossible < bestScore ||
                (maximumPossible == bestScore && wasteMinutes >= bestWasteMinutes))
            {
                return;
            }

            if (index == items.Count)
            {
                if (score > bestScore || (score == bestScore && wasteMinutes < bestWasteMinutes))
                {
                    bestScore = score;
                    bestWasteMinutes = wasteMinutes;
                    Array.Copy(current, best, current.Length);
                }
                return;
            }

            var item = items[index];
            foreach (var roomIndex in item.CandidateRooms)
            {
                if (!CanPlace(item, occupied[roomIndex], items)) continue;
                current[index] = roomIndex;
                occupied[roomIndex].Add(index);
                Search(index + 1, score + item.Weight,
                    wasteMinutes + SeatWasteMinutes(item, rooms[roomIndex]));
                occupied[roomIndex].RemoveAt(occupied[roomIndex].Count - 1);
                current[index] = -1;
            }

            Search(index + 1, score, wasteMinutes);
        }

        Search(0, 0, 0);

        var assignmentsByInput = new Dictionary<int, AllocationAssignment>();
        for (var index = 0; index < items.Count; index++)
        {
            var roomIndex = best[index];
            if (roomIndex < 0) continue;
            var item = items[index];
            var room = rooms[roomIndex];
            assignmentsByInput[item.InputIndex] = new AllocationAssignment(
                item.Event.Id,
                item.Event.Title,
                room.Id,
                room.Name,
                item.Event.Start,
                item.Event.End,
                item.Event.Attendees,
                room.Capacity,
                room.Capacity - item.Event.Attendees,
                item.Event.Priority);
        }

        var unassigned = new List<AllocationUnassigned>();
        for (var index = 0; index < events.Count; index++)
        {
            if (assignmentsByInput.ContainsKey(index)) continue;
            var requested = events[index];
            unassigned.Add(new AllocationUnassigned(
                requested?.Id ?? "",
                requested?.Title ?? "",
                errors.GetValueOrDefault(index, "No conflict-free room assignment was found for this event.")));
        }

        var assignmentsResult = assignmentsByInput.Values
            .OrderBy(assignment => assignment.Start)
            .ThenBy(assignment => assignment.EventTitle, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var validIntervals = events
            .Where(requested => requested is not null && requested.End > requested.Start &&
                (requested.End - requested.Start).TotalHours <= 12)
            .ToArray();
        var planningWindows = BuildPlanningWindows(validIntervals);
        var planningMinutes = planningWindows.Sum(window => DurationMinutes(window.Start, window.End));

        long totalOccupiedMinutes = 0;
        long totalAttendeeMinutes = 0;
        long totalSeatMinutes = 0;
        long totalWastedSeatMinutes = 0;
        var roomUtilization = new List<AllocationRoomUtilization>();
        foreach (var room in rooms)
        {
            var existingMinutes = activeReservations.TryGetValue(room.Id, out var existing)
                ? MergedMinutes(existing, planningWindows)
                : 0;
            var allocated = assignmentsResult.Where(assignment =>
                string.Equals(assignment.ResourceId, room.Id, StringComparison.OrdinalIgnoreCase)).ToArray();
            var allocatedMinutes = allocated.Sum(assignment => DurationMinutes(assignment.Start, assignment.End));
            var attendeeMinutes = allocated.Sum(assignment =>
                DurationMinutes(assignment.Start, assignment.End) * assignment.Attendees);
            var seatMinutes = allocatedMinutes * room.Capacity;
            totalOccupiedMinutes += existingMinutes + allocatedMinutes;
            totalAttendeeMinutes += attendeeMinutes;
            totalSeatMinutes += seatMinutes;
            totalWastedSeatMinutes += seatMinutes - attendeeMinutes;

            roomUtilization.Add(new AllocationRoomUtilization(
                room.Id,
                room.Name,
                room.Capacity,
                existingMinutes,
                allocatedMinutes,
                planningMinutes,
                Percent(existingMinutes + allocatedMinutes, planningMinutes),
                Percent(attendeeMinutes, seatMinutes)));
        }

        var summary = new AllocationSummary(
            events.Count,
            assignmentsResult.Length,
            unassigned.Count,
            Percent(assignmentsResult.Length, events.Count),
            Percent(totalAttendeeMinutes, totalSeatMinutes),
            Math.Round(totalWastedSeatMinutes / 60.0, 1),
            Percent(totalOccupiedMinutes, planningMinutes * rooms.Length));

        return new AllocationPlanResult(
            assignmentsResult,
            unassigned.ToArray(),
            roomUtilization.ToArray(),
            summary,
            MethodDescription);
    }

    /// <summary>Creates 50 overlapping, fictional events across five weekdays.</summary>
    public static AllocationEvent[] CreateDemoEvents(DateTimeOffset firstDay)
    {
        var day = DateOnly.FromDateTime(firstDay.Date);
        while (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) day = day.AddDays(1);

        var starts = new (int Hour, int Minute)[]
        {
            (8, 30), (9, 0), (10, 30), (11, 0), (13, 0),
            (13, 30), (14, 30), (15, 0), (16, 0), (16, 30)
        };
        var sizes = new[] { 8, 12, 16, 20, 24, 28, 36, 42, 18, 30 };
        var subjects = new[]
        {
            "Design studio", "Statistics seminar", "Writing workshop", "Robotics lab",
            "History discussion", "Research colloquium", "Programming tutorial",
            "Team project", "Faculty briefing", "Student showcase"
        };
        var result = new List<AllocationEvent>(50);

        for (var dayIndex = 0; dayIndex < 5; dayIndex++)
        {
            while (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) day = day.AddDays(1);
            for (var slot = 0; slot < 10; slot++)
            {
                var number = dayIndex * 10 + slot + 1;
                var start = CampusTime.At(day, starts[slot].Hour, starts[slot].Minute);
                var end = start.AddMinutes(slot % 3 == 0 ? 90 : 75);
                var features = slot % 5 == 0
                    ? new[] { "computers" }
                    : slot % 3 == 0
                        ? new[] { "projector" }
                        : new[] { "whiteboard" };
                result.Add(new AllocationEvent(
                    $"demo-{number:00}",
                    $"{subjects[slot]} {dayIndex + 1}",
                    start,
                    end,
                    sizes[slot],
                    features,
                    number % 7 == 0,
                    1 + ((number + slot) % 5)));
            }
            day = day.AddDays(1);
        }

        return result.ToArray();
    }

    private static bool MeetsRequirements(Resource room, AllocationEvent requested)
    {
        if (room.Capacity < requested.Attendees || (requested.Accessible && !room.Accessible)) return false;
        var features = room.Features ?? Array.Empty<string>();
        return (requested.RequiredFeatures ?? Array.Empty<string>()).All(required =>
            features.Any(available => string.Equals(
                available?.Trim(), required?.Trim(), StringComparison.OrdinalIgnoreCase)));
    }

    private static bool HasReservationConflict(
        string roomId,
        DateTimeOffset start,
        DateTimeOffset end,
        IReadOnlyDictionary<string, Reservation[]> activeReservations)
    {
        return activeReservations.TryGetValue(roomId, out var existing) &&
               existing.Any(reservation => Overlaps(start, end, reservation.Start, reservation.End));
    }

    private static bool CanPlace(PlanningItem item, List<int> placed, IReadOnlyList<PlanningItem> items)
    {
        return placed.All(index => !Overlaps(
            item.Event.Start, item.Event.End,
            items[index].Event.Start, items[index].Event.End));
    }

    private static bool IsInactive(string? status) =>
        string.Equals(status, "cancelled", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(status, "canceled", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(status, "rejected", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(status, "declined", StringComparison.OrdinalIgnoreCase);

    private static bool Overlaps(
        DateTimeOffset leftStart,
        DateTimeOffset leftEnd,
        DateTimeOffset rightStart,
        DateTimeOffset rightEnd) => leftStart < rightEnd && leftEnd > rightStart;

    private static long DurationMinutes(DateTimeOffset start, DateTimeOffset end) =>
        Math.Max(0, (long)Math.Ceiling((end - start).TotalMinutes));

    private static long SeatWasteMinutes(PlanningItem item, Resource room) =>
        item.DurationMinutes * (room.Capacity - item.Event.Attendees);

    private static double Percent(long numerator, long denominator) =>
        denominator <= 0 ? 0 : Math.Round(Math.Min(100, 100.0 * numerator / denominator), 1);

    private static (DateTimeOffset Start, DateTimeOffset End)[] BuildPlanningWindows(
        AllocationEvent[] events)
    {
        // Measure utilization over the campus day on each date requested, rather
        // than counting nights between events as unused room time.
        var byDate = new Dictionary<DateOnly, (DateTimeOffset Start, DateTimeOffset End)>();
        foreach (var requested in events)
        {
            var segmentStart = requested.Start;
            while (segmentStart < requested.End)
            {
                var nextMidnight = new DateTimeOffset(segmentStart.Date.AddDays(1), segmentStart.Offset);
                var segmentEnd = requested.End < nextMidnight ? requested.End : nextMidnight;
                var dayStart = new DateTimeOffset(segmentStart.Date.AddHours(8), segmentStart.Offset);
                var dayEnd = new DateTimeOffset(segmentStart.Date.AddHours(18), segmentStart.Offset);
                var windowStart = segmentStart < dayStart ? segmentStart : dayStart;
                var windowEnd = segmentEnd > dayEnd ? segmentEnd : dayEnd;
                var date = DateOnly.FromDateTime(segmentStart.Date);
                if (byDate.TryGetValue(date, out var existing))
                {
                    byDate[date] = (
                        windowStart < existing.Start ? windowStart : existing.Start,
                        windowEnd > existing.End ? windowEnd : existing.End);
                }
                else
                {
                    byDate[date] = (windowStart, windowEnd);
                }
                segmentStart = segmentEnd;
            }
        }
        return byDate.OrderBy(pair => pair.Key).Select(pair => pair.Value).ToArray();
    }

    private static long MergedMinutes(
        Reservation[] reservations,
        (DateTimeOffset Start, DateTimeOffset End)[] planningWindows)
    {
        return planningWindows.Sum(window => MergedMinutesInWindow(reservations, window.Start, window.End));
    }

    private static long MergedMinutesInWindow(
        Reservation[] reservations,
        DateTimeOffset windowStart,
        DateTimeOffset windowEnd)
    {
        var intervals = reservations
            .Where(reservation => Overlaps(reservation.Start, reservation.End, windowStart, windowEnd))
            .Select(reservation => (
                Start: reservation.Start > windowStart ? reservation.Start : windowStart,
                End: reservation.End < windowEnd ? reservation.End : windowEnd))
            .OrderBy(interval => interval.Start)
            .ToArray();
        if (intervals.Length == 0) return 0;

        var start = intervals[0].Start;
        var end = intervals[0].End;
        long minutes = 0;
        foreach (var interval in intervals.Skip(1))
        {
            if (interval.Start <= end)
            {
                if (interval.End > end) end = interval.End;
            }
            else
            {
                minutes += DurationMinutes(start, end);
                start = interval.Start;
                end = interval.End;
            }
        }
        return minutes + DurationMinutes(start, end);
    }
}
