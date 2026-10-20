using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace SpaceSense.Api;

/// <summary>
/// Optional LLM extraction. Its output is validated and merged with explicit
/// requirements found by the local parser before the normal search engine runs.
/// </summary>
public static class OpenAiBookingExtractor
{
    private static readonly HttpClient Client = new() { Timeout = TimeSpan.FromSeconds(8) };
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> Types = new(StringComparer.OrdinalIgnoreCase)
        { "room", "classroom", "lab", "study", "equipment" };

    public static async Task<NaturalInterpretation?> TryInterpretAsync(
        string prompt, NaturalInterpretation baseline, CancellationToken cancellationToken)
    {
        var key = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (string.IsNullOrWhiteSpace(key)) return null;

        var schema = new
        {
            type = "object",
            additionalProperties = false,
            properties = new Dictionary<string, object>
            {
                ["query"] = new { type = new[] { "string", "null" } },
                ["type"] = new { type = new[] { "string", "null" } },
                ["minCapacity"] = new { type = new[] { "integer", "null" } },
                ["features"] = new { type = "array", items = new { type = "string" } },
                ["accessible"] = new { type = new[] { "boolean", "null" } },
                ["date"] = new { type = new[] { "string", "null" } },
                ["startTime"] = new { type = new[] { "string", "null" } },
                ["endTime"] = new { type = new[] { "string", "null" } }
            },
            required = new[] { "query", "type", "minCapacity", "features", "accessible", "date", "startTime", "endTime" }
        };

        var body = new
        {
            model = Environment.GetEnvironmentVariable("OPENAI_MODEL") ?? "gpt-4.1-mini",
            input = new object[]
            {
                new { role = "system", content =
                    $"Extract campus room search filters. Campus date today is {CampusTime.Today:yyyy-MM-dd}; timezone is {CampusTime.ZoneName}. " +
                    "Return only requirements grounded in the user request. Use null for unspecified values. " +
                    "Use date YYYY-MM-DD and 24-hour times HH:mm. Interpret 'next weekday' as the weekday in the next calendar week. " +
                    "Allowed types: room, classroom, lab, study, equipment. Allowed features: projector, whiteboard, computers, hybrid, microphone, display, 3d printer, portable, camera, workbenches." },
                new { role = "user", content = prompt }
            },
            text = new { format = new { type = "json_schema", name = "booking_filters", strict = true, schema } }
        };

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/responses")
            {
                Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
            using var response = await Client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            if (!document.RootElement.TryGetProperty("status", out var status) ||
                status.GetString() != "completed") return null;
            var output = document.RootElement.GetProperty("output");
            foreach (var item in output.EnumerateArray())
            {
                if (!item.TryGetProperty("content", out var content)) continue;
                foreach (var part in content.EnumerateArray())
                {
                    if (!part.TryGetProperty("type", out var kind) || kind.GetString() != "output_text" ||
                        !part.TryGetProperty("text", out var text)) continue;
                    var fields = JsonSerializer.Deserialize<LlmFields>(text.GetString()!, JsonOptions);
                    if (fields is not null) return Merge(prompt, baseline, fields);
                }
            }
        }
        catch (Exception)
        {
            // Invalid responses, timeouts, and network failures use the local parser.
        }
        return null;
    }

    private static NaturalInterpretation Merge(string prompt, NaturalInterpretation baseline, LlmFields fields)
    {
        var knownFeatures = ResourceCatalog.All.SelectMany(r => r.Features)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var groundedFeatures = (fields.Features ?? Array.Empty<string>())
            .Where(feature => knownFeatures.Contains(feature) && FeatureIsGrounded(feature, prompt));
        var features = baseline.Features.Concat(groundedFeatures)
            .Distinct(StringComparer.OrdinalIgnoreCase).Take(8).ToArray();

        int? capacity = baseline.MinCapacity;
        if (fields.MinCapacity is >= 1 and <= 500 &&
            System.Text.RegularExpressions.Regex.IsMatch(prompt, $@"\b{fields.MinCapacity}\b"))
            capacity = Math.Max(capacity ?? 0, fields.MinCapacity.Value);

        DateTimeOffset? start = baseline.Start;
        DateTimeOffset? end = baseline.End;
        if (!start.HasValue && HasDateCue(prompt) &&
            DateOnly.TryParseExact(fields.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var date) &&
            TimeOnly.TryParseExact(fields.StartTime, "HH:mm", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var startTime) &&
            TimeOnly.TryParseExact(fields.EndTime, "HH:mm", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var endTime) &&
            date.DayNumber >= CampusTime.Today.DayNumber - 1 &&
            date.DayNumber <= CampusTime.Today.DayNumber + 366)
        {
            var proposedStart = CampusTime.At(date, startTime.Hour, startTime.Minute);
            var proposedEnd = CampusTime.At(date, endTime.Hour, endTime.Minute);
            if (proposedEnd > proposedStart && (proposedEnd - proposedStart).TotalHours <= 12)
            {
                start = proposedStart;
                end = proposedEnd;
            }
        }

        var type = baseline.Type ?? (fields.Type is not null && Types.Contains(fields.Type)
            ? fields.Type.ToLowerInvariant() : null);
        var query = baseline.Query ?? (fields.Query is { Length: > 1 and <= 60 } &&
            prompt.Contains(fields.Query, StringComparison.OrdinalIgnoreCase) ? fields.Query : null);
        var accessible = baseline.Accessible == true ||
            (fields.Accessible == true && HasAccessibilityCue(prompt)) ? true : baseline.Accessible;
        return new NaturalInterpretation(query, type, capacity, features,
            accessible,
            start, end);
    }

    private static bool FeatureIsGrounded(string feature, string prompt)
    {
        if (prompt.Contains(feature, StringComparison.OrdinalIgnoreCase)) return true;
        return feature.ToLowerInvariant() switch
        {
            "computers" => prompt.Contains("computer", StringComparison.OrdinalIgnoreCase) ||
                System.Text.RegularExpressions.Regex.IsMatch(prompt, @"\bpcs?\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase),
            "hybrid" => prompt.Contains("video conference", StringComparison.OrdinalIgnoreCase) ||
                prompt.Contains("zoom", StringComparison.OrdinalIgnoreCase),
            "whiteboard" => prompt.Contains("white board", StringComparison.OrdinalIgnoreCase),
            "3d printer" => prompt.Contains("3-d printer", StringComparison.OrdinalIgnoreCase),
            _ => false
        };
    }

    private static bool HasDateCue(string prompt) =>
        System.Text.RegularExpressions.Regex.IsMatch(prompt,
            @"\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|october|november|december|january|february|march|april|may|june|july|august|september|\d{4}-\d{2}-\d{2})\b",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    private static bool HasAccessibilityCue(string prompt) =>
        System.Text.RegularExpressions.Regex.IsMatch(prompt,
            @"\b(accessible|wheelchair|step.free|ada|no stairs)\b",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    private sealed record LlmFields(string? Query, string? Type, int? MinCapacity,
        string[]? Features, bool? Accessible, string? Date, string? StartTime, string? EndTime);
}
