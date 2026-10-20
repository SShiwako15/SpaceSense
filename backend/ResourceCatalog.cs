namespace SpaceSense.Api;

public static class ResourceCatalog
{
    public static readonly IReadOnlyList<Resource> All = new Resource[]
    {
        new("lecture-a", "Horizon Lecture Hall", "classroom", "North Academic Center", 120,
            ["projector", "whiteboard", "microphone", "hybrid"], true,
            "Tiered lecture hall with lecture capture and step-free access."),
        new("lecture-b", "Summit Auditorium", "classroom", "North Academic Center", 80,
            ["projector", "whiteboard", "microphone"], true,
            "Flexible auditorium for lectures and campus presentations."),
        new("seminar", "Oak Seminar Room", "classroom", "North Academic Center", 32,
            ["projector", "whiteboard", "hybrid"], true,
            "Seminar room with movable tables and video conferencing."),
        new("class-201", "Maple Classroom 201", "classroom", "East Hall", 48,
            ["projector", "whiteboard"], true,
            "General purpose classroom with collaborative seating."),
        new("class-202", "Maple Classroom 202", "classroom", "East Hall", 36,
            ["projector", "whiteboard"], true,
            "Bright classroom close to the campus library."),
        new("class-305", "Cedar Classroom 305", "classroom", "West Hall", 44,
            ["projector", "whiteboard", "hybrid"], false,
            "Teaching room with hybrid meeting equipment; stair access only."),
        new("class-306", "Cedar Classroom 306", "classroom", "West Hall", 24,
            ["projector", "whiteboard"], true,
            "Compact teaching room suited to small classes."),
        new("lab-east", "Innovation Computer Lab", "lab", "Innovation Center", 28,
            ["computers", "projector", "whiteboard"], true,
            "Computer lab with 28 workstations and accessible desks."),
        new("lab-west", "Discovery Computer Lab", "lab", "Innovation Center", 40,
            ["computers", "projector", "whiteboard"], true,
            "Computer lab for software instruction and group work."),
        new("lab-maker", "Maker Workshop", "lab", "Innovation Center", 20,
            ["whiteboard", "3d printer", "workbenches"], true,
            "Hands-on workshop with supervised maker equipment."),
        new("study-a", "Library Study Room A", "study", "Main Library", 8,
            ["whiteboard", "display"], true,
            "Quiet enclosed room for group study."),
        new("study-b", "Library Study Room B", "study", "Main Library", 12,
            ["projector", "whiteboard"], true,
            "Group study room with presentation equipment."),
        new("studio", "Collaborative Studio", "study", "Student Commons", 24,
            ["projector", "whiteboard", "hybrid"], true,
            "Open-plan space for workshops and team projects."),
        new("equipment-projector", "Portable Projector Kit", "equipment", "Media Services", 1,
            ["projector", "portable"], true,
            "Portable projector with HDMI adapter and carry case."),
        new("equipment-camera", "Video Camera Kit", "equipment", "Media Services", 1,
            ["camera", "portable"], true,
            "Camera, tripod, and microphone for class projects.")
    };

    public static Resource? Find(string id) =>
        All.FirstOrDefault(r => string.Equals(r.Id, id, StringComparison.OrdinalIgnoreCase));
}
