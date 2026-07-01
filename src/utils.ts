import { Campaign } from "./types";

export const getCampaignCategory = (camp: Campaign): "Cultures" | "locations" | "Objects" | "Actions" | "Miscellaneous" => {
  if (camp.isVerified) return "locations";

  if (camp.domainType) {
    const lower = camp.domainType.toLowerCase();
    if (lower === "cultures") return "Cultures";
    if (lower === "locations" || lower === "places" || lower === "locations (places)") return "locations";
    if (lower === "objects" || lower === "things") return "Objects";
    if (lower === "actions" || lower === "verbs") return "Actions";
    return "Miscellaneous";
  }

  const title = (camp?.domainTitle || "").toLowerCase();
  let suffix = title;
  if (title.startsWith("king of ")) {
    suffix = title.substring(8);
  } else if (title.startsWith("queen of ")) {
    suffix = title.substring(9);
  }
  suffix = suffix.trim();

  if (suffix.endsWith("ing")) {
    return "Actions";
  }
  if (suffix.match(/(ians|ers|ists|ans|ese|ics|people|voters|users|players|vikings|romans|goths|spartans|tribes|gangs|lords|ladies|crowd|scholars|experts|artists)$/)) {
    return "Cultures";
  }
  if (suffix.endsWith("s") && suffix.length > 3) {
    return "Objects";
  }
  const knownLocations = ["london", "tokyo", "paris", "york", "california", "texas", "japan", "asia", "america", "boston", "india", "berlin", "rome", "eiffel tower", "grand canyon", "mars", "moon"];
  if (knownLocations.includes(suffix) || suffix.includes("city") || suffix.includes("country") || suffix.includes("valley") || suffix.includes("island") || suffix.includes("mount")) {
    return "locations";
  }

  return "Miscellaneous";
};
