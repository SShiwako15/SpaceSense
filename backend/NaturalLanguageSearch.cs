using System.Globalization;
using System.Text.RegularExpressions;

namespace SpaceSense.Api;

public static partial class NaturalLanguageSearch
{
    private static readonly (string Phrase, string Feature)[] FeatureTerms =
    [
        ("projector", "projector"), ("whiteboard", "whiteboard"),
        ("computer", "computers"), ("hybrid", "hybrid"),
        ("video conferencing", "hybrid"), ("microphone", "microphone"),
        ("display", "display"), ("3d printer", "3d printer")
    ];

    public static NaturalInterpretation Interpret(string prompt)
    {
        var text = prompt.ToLowerInvariant();
        var capacity = CapacityPattern().Match(text);
        var capacityText = capacity.Groups.Cast<Group>().Skip(1).FirstOrDefault(group => group.Success)?.Value;
        int? minCapacity = capacity.Success && int.TryParse(capacityText, out var n) ? n : null;

        var type = text.Contains("portable projector") || text.Contains("camera kit") ||
            text.Contains("equipment") ? "equipment" :
            text.Contains("lab") ? "lab" :
            text.Contains("study") ? "study" :
            text.Contains("classroom") || text.Contains("lecture") ? "classroom" :
            text.Contains("room") || text.Contains("space") ? "room" : null;

        var features = FeatureTerms.Where(pair => text.Contains(pair.Phrase))
            .Select(pair => pair.Feature).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        bool? accessible = text.Contains("accessible") || text.Contains("wheelchair") ||
            text.Contains("step-free") || text.Contains("step free") ||
            text.Contains("no stairs") || text.Contains("ada") ? true : null;

        string? query = text.Contains("library") ? "library" :
            text.Contains("innovation center") ? "innovation" :
            text.Contains("east hall") ? "east hall" :
            text.Contains("west hall") ? "west hall" : null;

        var date = ParseDate(text);
        DateTimeOffset? start = null;
        DateTimeOffset? end = null;
        if (date.HasValue)
        {
            var (startHour, startMinute, endHour, endMinute) = ParseTime(text);
            start = CampusTime.At(date.Value, startHour, startMinute);
            end = CampusTime.At(date.Value, endHour, endMinute);
            if (end <= start) end = CampusTime.At(date.Value.AddDays(1), endHour, endMinute);
        }

        return new NaturalInterpretation(query, type, minCapacity, features,
            accessible, start, end);
    }

    private static DateOnly? ParseDate(string text)
    {
        var iso = IsoDatePattern().Match(text);
        if (iso.Success && DateOnly.TryParseExact(iso.Value, "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var specified))
            return specified;

        var today = CampusTime.Today;
        if (text.Contains("tomorrow")) return today.AddDays(1);
        if (text.Contains("today")) return today;

        var weekday = WeekdayPattern().Match(text);
        if (weekday.Success && Enum.TryParse<DayOfWeek>(
                CultureInfo.InvariantCulture.TextInfo.ToTitleCase(weekday.Groups[2].Value),
                out var day))
        {
            if (weekday.Groups[1].Value == "next")
            {
                // "Next Tuesday" means Tuesday of the next calendar week.
                var daysToMonday = ((int)DayOfWeek.Monday - (int)today.DayOfWeek + 7) % 7;
                if (daysToMonday == 0) daysToMonday = 7;
                var offsetFromMonday = ((int)day - (int)DayOfWeek.Monday + 7) % 7;
                return today.AddDays(daysToMonday + offsetFromMonday);
            }
            var days = ((int)day - (int)today.DayOfWeek + 7) % 7;
            // Bare weekdays and "this Tuesday" select the next occurrence.
            return today.AddDays(days == 0 ? 7 : days);
        }
        return null;
    }

    private static (int StartHour, int StartMinute, int EndHour, int EndMinute) ParseTime(string text)
    {
        var range = RangePattern().Match(text);
        if (range.Success)
        {
            var firstMeridiem = range.Groups[3].Value;
            var secondMeridiem = range.Groups[6].Value;
            if (firstMeridiem.Length == 0 && secondMeridiem.Length == 0)
            {
                var inferred = PeriodMeridiem(text);
                firstMeridiem = inferred;
                secondMeridiem = inferred;
            }
            if (firstMeridiem.Length == 0 && secondMeridiem.Length > 0)
                firstMeridiem = secondMeridiem;
            var first = Hour(int.Parse(range.Groups[1].Value), firstMeridiem);
            var second = Hour(int.Parse(range.Groups[4].Value), secondMeridiem);
            var firstMinute = Minute(range.Groups[2].Value);
            var secondMinute = Minute(range.Groups[5].Value);
            if (first < 0 || second < 0 || firstMinute > 59 || secondMinute > 59)
                return DefaultTime(text);
            if (first > second && firstMeridiem == secondMeridiem && firstMeridiem == "pm")
                first -= 12; // e.g. "between 11 and 1 pm"
            return (first, firstMinute, second, secondMinute);
        }

        var at = AtPattern().Match(text);
        if (at.Success)
        {
            var meridiem = at.Groups[3].Value.Length > 0 ? at.Groups[3].Value : PeriodMeridiem(text);
            var hour = Hour(int.Parse(at.Groups[1].Value), meridiem);
            var minute = Minute(at.Groups[2].Value);
            if (hour < 0 || minute > 59) return DefaultTime(text);
            var duration = DurationPattern().Match(text);
            var minutes = duration.Success ? int.Parse(duration.Groups[1].Value) *
                (duration.Groups[2].Value.StartsWith("hour") ? 60 : 1) : 120;
            minutes = Math.Clamp(minutes, 30, 720);
            var end = hour * 60 + minute + minutes;
            return (hour, minute, end / 60 % 24, end % 60);
        }

        return DefaultTime(text);
    }

    private static (int, int, int, int) DefaultTime(string text) =>
        text.Contains("afternoon") ? (12, 0, 17, 0) :
        text.Contains("morning") ? (8, 0, 12, 0) :
        text.Contains("evening") ? (17, 0, 21, 0) : (9, 0, 17, 0);

    private static int Hour(int hour, string meridiem) => meridiem switch
    {
        "am" or "pm" when hour is < 1 or > 12 => -1,
        "am" => hour % 12,
        "pm" => hour % 12 + 12,
        _ => hour <= 23 ? hour : -1
    };
    private static string PeriodMeridiem(string text) =>
        text.Contains("afternoon") || text.Contains("evening") ? "pm" :
        text.Contains("morning") ? "am" : "";
    private static int Minute(string value) => value.Length == 0 ? 0 : int.Parse(value);

    [GeneratedRegex(@"\bfor\s+(\d{1,3})\s+(?:people|students?|attendees?|persons?|seats?)\b|\b(?:seats?|capacity\s*(?:of|for)?)\s*(\d{1,3})\b|\b(\d{1,3})\s+(?:people|students?|attendees?|persons?)\b", RegexOptions.IgnoreCase)]
    private static partial Regex CapacityPattern();

    [GeneratedRegex(@"\b\d{4}-\d{2}-\d{2}\b")]
    private static partial Regex IsoDatePattern();

    [GeneratedRegex(@"\b(?:(next|this|on)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", RegexOptions.IgnoreCase)]
    private static partial Regex WeekdayPattern();

    [GeneratedRegex(@"\b(?:between|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", RegexOptions.IgnoreCase)]
    private static partial Regex RangePattern();

    [GeneratedRegex(@"\b(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", RegexOptions.IgnoreCase)]
    private static partial Regex AtPattern();

    [GeneratedRegex(@"\bfor\s+(\d{1,3})\s*(hours?|minutes?)\b", RegexOptions.IgnoreCase)]
    private static partial Regex DurationPattern();
}
