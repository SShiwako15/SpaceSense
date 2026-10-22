import { randomUUID } from "node:crypto";
import { now, at } from "./time.js";

export const id = () => randomUUID().replaceAll("-", "");
export const resources = [
  [
    "lecture-a",
    "Horizon Lecture Hall",
    "classroom",
    "North Academic Center",
    120,
    ["projector", "whiteboard", "microphone", "hybrid"],
    true,
    "Tiered lecture hall with lecture capture and step-free access.",
  ],
  [
    "lecture-b",
    "Summit Auditorium",
    "classroom",
    "North Academic Center",
    80,
    ["projector", "whiteboard", "microphone"],
    true,
    "Flexible auditorium for lectures and campus presentations.",
  ],
  [
    "seminar",
    "Oak Seminar Room",
    "classroom",
    "North Academic Center",
    32,
    ["projector", "whiteboard", "hybrid"],
    true,
    "Seminar room with movable tables and video conferencing.",
  ],
  [
    "class-201",
    "Maple Classroom 201",
    "classroom",
    "East Hall",
    48,
    ["projector", "whiteboard"],
    true,
    "General purpose classroom with collaborative seating.",
  ],
  [
    "class-202",
    "Maple Classroom 202",
    "classroom",
    "East Hall",
    36,
    ["projector", "whiteboard"],
    true,
    "Bright classroom close to the campus library.",
  ],
  [
    "class-305",
    "Cedar Classroom 305",
    "classroom",
    "West Hall",
    44,
    ["projector", "whiteboard", "hybrid"],
    false,
    "Teaching room with hybrid meeting equipment; stair access only.",
  ],
  [
    "class-306",
    "Cedar Classroom 306",
    "classroom",
    "West Hall",
    24,
    ["projector", "whiteboard"],
    true,
    "Compact teaching room suited to small classes.",
  ],
  [
    "lab-east",
    "Innovation Computer Lab",
    "lab",
    "Innovation Center",
    28,
    ["computers", "projector", "whiteboard"],
    true,
    "Computer lab with 28 workstations and accessible desks.",
    true,
  ],
  [
    "lab-west",
    "Discovery Computer Lab",
    "lab",
    "Innovation Center",
    40,
    ["computers", "projector", "whiteboard"],
    true,
    "Computer lab for software instruction and group work.",
    true,
  ],
  [
    "lab-maker",
    "Maker Workshop",
    "lab",
    "Innovation Center",
    20,
    ["whiteboard", "3d printer", "workbenches"],
    true,
    "Hands-on workshop with supervised maker equipment.",
    true,
  ],
  [
    "study-a",
    "Library Study Room A",
    "study",
    "Main Library",
    8,
    ["whiteboard", "display"],
    true,
    "Quiet enclosed room for group study.",
  ],
  [
    "study-b",
    "Library Study Room B",
    "study",
    "Main Library",
    12,
    ["projector", "whiteboard"],
    true,
    "Group study room with presentation equipment.",
  ],
  [
    "studio",
    "Collaborative Studio",
    "study",
    "Student Commons",
    24,
    ["projector", "whiteboard", "hybrid"],
    true,
    "Open-plan space for workshops and team projects.",
  ],
  [
    "equipment-projector",
    "Portable Projector Kit",
    "equipment",
    "Media Services",
    1,
    ["projector", "portable"],
    true,
    "Portable projector with HDMI adapter and carry case.",
    true,
  ],
  [
    "equipment-camera",
    "Video Camera Kit",
    "equipment",
    "Media Services",
    1,
    ["camera", "portable"],
    true,
    "Camera, tripod, and microphone for class projects.",
    true,
  ],
].map(
  ([
    id,
    name,
    type,
    building,
    capacity,
    features,
    accessible,
    description,
    requiresApproval = false,
  ]) => ({
    id,
    name,
    type,
    building,
    capacity,
    features,
    accessible,
    description,
    requiresApproval,
  }),
);

export function seedReservations() {
  const today = now().startOf("day");
  const result = [];
  const push = (
    resourceId,
    title,
    organizer,
    date,
    start,
    end,
    attendees,
    history = false,
  ) =>
    result.push({
      id: history ? `history-${date.toFormat("yyyyMMdd")}-${resourceId}` : id(),
      resourceId,
      title,
      organizer,
      start: at(date.toISODate(), start),
      end: at(date.toISODate(), end),
      attendees,
      status: "confirmed",
      seriesId: null,
      ownerId: null,
    });
  let date = today.plus({ days: 1 });
  while (date.weekday > 5) date = date.plus({ days: 1 });
  push("class-201", "Calculus tutorial", "Dr. Patel", date, 9, 11, 30);
  push("study-a", "Group study", "Maya Chen", date, 14, 16, 6);
  push(
    "lab-east",
    "Robotics lab session",
    "Prof. Reed",
    date.plus({ days: 1 }),
    13,
    16,
    22,
  );
  push(
    "lecture-a",
    "Campus research forum",
    "Research Office",
    date.plus({ days: 2 }),
    9,
    11,
    75,
  );
  push(
    "studio",
    "Design workshop",
    "Alex Rivera",
    date.plus({ days: 3 }),
    15,
    17,
    18,
  );
  for (let offset = -56; offset < 0; offset++) {
    const day = today.plus({ days: offset }),
      week = Math.floor((offset + 56) / 7);
    if (day.weekday > 5) continue;
    const history = (room, title, org, start, end, size) =>
      push(room, title, org, day, start, end, size, true);
    history(
      "class-201",
      "Applied Mathematics",
      "Academic Scheduling",
      9,
      11,
      26 + (week % 5),
    );
    history(
      "study-a",
      "Student study session",
      "Student Groups",
      15,
      17,
      4 + (week % 4),
    );
    if ([1, 3, 5].includes(day.weekday))
      history(
        "seminar",
        "Faculty seminar",
        "Academic Scheduling",
        12,
        14,
        18 + (week % 6),
      );
    if ([2, 4].includes(day.weekday))
      history(
        "lab-east",
        "Programming laboratory",
        "Computer Science",
        13,
        16,
        19 + (week % 7),
      );
    if ([1, 4].includes(day.weekday))
      history(
        "lecture-b",
        "Campus lecture",
        "Academic Scheduling",
        10,
        12,
        52 + (week % 9),
      );
    if ([3, 5].includes(day.weekday))
      history(
        "studio",
        "Collaborative workshop",
        "Student Groups",
        14,
        16,
        12 + (week % 7),
      );
    if (day.weekday === 2)
      history(
        "lab-maker",
        "Maker skills workshop",
        "Innovation Center",
        9,
        11,
        10 + (week % 6),
      );
  }
  return result.sort((a, b) => a.start.localeCompare(b.start));
}
