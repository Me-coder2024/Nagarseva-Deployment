import { prisma } from "../lib/prisma.js";

interface ChatRequest {
  question: string;
  language?: "english" | "hindi" | "gujarati";
}

interface ChatResponse {
  question: string;
  result: {
    content: string;
  };
}

export async function processLocalCivicAiQuery(
  question: string,
  language: "english" | "hindi" | "gujarati" = "english"
): Promise<ChatResponse> {
  const q = question.toLowerCase().trim();

  // Fetch real-time database snapshot
  const [issues, wards, routes, users] = await Promise.all([
    prisma.issue.findMany({
      include: {
        ward: true,
        route: true,
        analysis: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ward.findMany({
      include: {
        routes: true,
        issues: true,
      },
    }),
    prisma.route.findMany({
      include: {
        ward: true,
        issues: true,
        assignments: {
          include: { surveyor: true },
        },
      },
    }),
    prisma.user.findMany({
      include: {
        ward: true,
      },
    }),
  ]);

  const totalIssues = issues.length;
  const openIssues = issues.filter(
    (i) => i.status !== "RESOLVED" && i.status !== "REJECTED"
  );
  const resolvedIssues = issues.filter((i) => i.status === "RESOLVED");
  const rejectedIssues = issues.filter((i) => i.status === "REJECTED");
  const detectedIssues = issues.filter((i) => i.status === "DETECTED");
  const assignedIssues = issues.filter((i) => i.status === "ASSIGNED");
  const inProgressIssues = issues.filter((i) => i.status === "IN_PROGRESS");
  const fixedIssues = issues.filter((i) => i.status === "FIXED");

  const potholeIssues = issues.filter((i) => i.type === "POTHOLE");
  const garbageIssues = issues.filter((i) => i.type === "GARBAGE");

  const engineers = users.filter((u) => u.role === "ENGINEER");
  const surveyors = users.filter((u) => u.role === "SURVEYOR");

  let content = "";

  // 1. OPEN ISSUES / ISSUE COUNT
  if (
    q.includes("how many") ||
    q.includes("open issue") ||
    q.includes("total issue") ||
    q.includes("count") ||
    q.includes("kitne issue") ||
    q.includes("kitne open") ||
    q.includes("કેટલા")
  ) {
    if (language === "hindi") {
      content = `### 📊 नगरसेवा स्थिति सारांश\n\n` +
        `वर्तमान में कुल **${openIssues.length} खुले मुद्दे (Open Issues)** हैं जिन पर कार्रवाई आवश्यक है (कुल दर्ज: ${totalIssues})।\n\n` +
        `| स्थिति (Status) | संख्या (Count) |\n` +
        `| :--- | :--- |\n` +
        `| 🔴 खोजे गए (Detected) | **${detectedIssues.length}** |\n` +
        `| 🟡 असाइन किए गए (Assigned) | **${assignedIssues.length}** |\n` +
        `| 🔵 प्रगति पर (In Progress) | **${inProgressIssues.length}** |\n` +
        `| 🟢 ठीक किए गए (Fixed) | **${fixedIssues.length}** |\n` +
        `| ✅ हल किए गए (Resolved) | **${resolvedIssues.length}** |\n` +
        `| ❌ अस्वीकृत (Rejected) | **${rejectedIssues.length}** |\n\n` +
        `> **सुझाव:** ${detectedIssues.length > 0 ? `सत्यापन और इंजीनियर असाइनमेंट के लिए ${detectedIssues.length} नए मुद्दे प्रतीक्षारत हैं।` : "सभी दर्ज मुद्दों पर कार्य प्रगति पर है।"}`;
    } else if (language === "gujarati") {
      content = `### 📊 નગરસેવા સ્થિતિ સારાંશ\n\n` +
        `હાલમાં કુલ **${openIssues.length} ખુલ્લા મુદ્દાઓ (Open Issues)** છે (કુલ નોંધાયેલ: ${totalIssues})。\n\n` +
        `| સ્થિતિ (Status) | સંખ્યા (Count) |\n` +
        `| :--- | :--- |\n` +
        `| 🔴 શોધાયેલ (Detected) | **${detectedIssues.length}** |\n` +
        `| 🟡 સોંપાયેલ (Assigned) | **${assignedIssues.length}** |\n` +
        `| 🔵 ચાલુ કામ (In Progress) | **${inProgressIssues.length}** |\n` +
        `| 🟢 સમારકામ થયેલ (Fixed) | **${fixedIssues.length}** |\n` +
        `| ✅ ઉકેલાયેલ (Resolved) | **${resolvedIssues.length}** |\n`;
    } else {
      content = `### 📊 Live Municipal Issue Summary\n\n` +
        `There are currently **${openIssues.length} open civic issues** requiring municipal attention (out of **${totalIssues}** total recorded).\n\n` +
        `| Lifecycle Status | Active Count | Share (%) |\n` +
        `| :--- | :---: | :---: |\n` +
        `| 🔴 **Detected** (Awaiting Assignment) | **${detectedIssues.length}** | ${totalIssues > 0 ? Math.round((detectedIssues.length / totalIssues) * 100) : 0}% |\n` +
        `| 🟡 **Assigned** (Engineer Allocated) | **${assignedIssues.length}** | ${totalIssues > 0 ? Math.round((assignedIssues.length / totalIssues) * 100) : 0}% |\n` +
        `| 🔵 **In Progress** (Active Repair) | **${inProgressIssues.length}** | ${totalIssues > 0 ? Math.round((inProgressIssues.length / totalIssues) * 100) : 0}% |\n` +
        `| 🌐 **Fixed** (Pending AI Verification) | **${fixedIssues.length}** | ${totalIssues > 0 ? Math.round((fixedIssues.length / totalIssues) * 100) : 0}% |\n` +
        `| 🟢 **Resolved** (Verified & Closed) | **${resolvedIssues.length}** | ${totalIssues > 0 ? Math.round((resolvedIssues.length / totalIssues) * 100) : 0}% |\n` +
        `| ⚪ **Rejected** (Invalid Report) | **${rejectedIssues.length}** | ${totalIssues > 0 ? Math.round((rejectedIssues.length / totalIssues) * 100) : 0}% |\n\n` +
        `**Issue Type Breakdown:**\n` +
        `- 🕳️ **Potholes:** ${potholeIssues.length} reported\n` +
        `- 🗑️ **Garbage Accumulation:** ${garbageIssues.length} reported\n\n` +
        `> **Action Item:** You can assign engineers directly from the [Issues page](/issues) or monitor live hotspots in [Map View](/map).`;
    }
  }

  // 2. ISSUES BY WARD
  else if (
    q.includes("ward") ||
    q.includes("area") ||
    q.includes("location") ||
    q.includes("ward-wise") ||
    q.includes("વોર્ડ")
  ) {
    const wardData = wards.map((w) => {
      const wardIssues = issues.filter((i) => i.wardId === w.id);
      const wardOpen = wardIssues.filter(
        (i) => i.status !== "RESOLVED" && i.status !== "REJECTED"
      );
      const potholes = wardIssues.filter((i) => i.type === "POTHOLE");
      const garbage = wardIssues.filter((i) => i.type === "GARBAGE");
      return {
        name: w.name,
        code: `W${(w.number ?? 0).toString().padStart(2, "0")}`,
        total: wardIssues.length,
        open: wardOpen.length,
        potholes: potholes.length,
        garbage: garbage.length,
      };
    });

    if (language === "hindi") {
      content = `### 🏙️ वार्ड अनुसार दर्ज समस्याओं का विवरण\n\n` +
        `वडोदरा शहर के सभी वार्डों में दर्ज समस्याओं का विवरण नीचे दिया गया है:\n\n` +
        `| वार्ड कोड | वार्ड का नाम | खुले मुद्दे (Open) | गड्ढे (Potholes) | कचरा (Garbage) | कुल (Total) |\n` +
        `| :--- | :--- | :---: | :---: | :---: | :---: |\n` +
        wardData
          .map(
            (w) =>
              `| **${w.code}** | ${w.name} | **${w.open}** | ${w.potholes} | ${w.garbage} | ${w.total} |`
          )
          .join("\n") +
        `\n\n> सबसे अधिक खुले मुद्दे **${wardData.sort((a, b) => b.open - a.open)[0]?.name || "शहरी क्षेत्र"}** में हैं।`;
    } else {
      content = `### 🏙️ Ward-wise Civic Issue Breakdown\n\n` +
        `Here is the real-time breakdown of issues distributed across Vadodara municipal wards:\n\n` +
        `| Ward Code | Ward Name | Open Issues | Potholes | Garbage | Total Reported |\n` +
        `| :--- | :--- | :---: | :---: | :---: | :---: |\n` +
        wardData
          .map(
            (w) =>
              `| **${w.code}** | **${w.name}** | <span style="color:#ef4444;font-weight:bold">${w.open}</span> | ${w.potholes} | ${w.garbage} | ${w.total} |`
          )
          .join("\n") +
        `\n\n` +
        `**Key Insights:**\n` +
        `- **Highest Volume Ward:** **${wardData.sort((a, b) => b.total - a.total)[0]?.name || "Alkapuri"}** with ${wardData.sort((a, b) => b.total - a.total)[0]?.total || 0} total issues.\n` +
        `- **Total Monitored Wards:** ${wards.length} administrative wards.\n\n` +
        `> Track ward density heatmaps directly in the [Map View](/map).`;
    }
  }

  // 3. ENGINEERS / STAFF / SURVEYORS
  else if (
    q.includes("engineer") ||
    q.includes("surveyor") ||
    q.includes("employee") ||
    q.includes("staff") ||
    q.includes("who is") ||
    q.includes("कर्मचारी") ||
    q.includes("ઇજનેર")
  ) {
    if (q.includes("surveyor")) {
      content = `### 📡 Active Field Surveyors (${surveyors.length})\n\n` +
        `Surveyors patrolling road corridors and logging AI vision detections:\n\n` +
        `| Surveyor Name | Email | Assigned Ward | Registered |\n` +
        `| :--- | :--- | :--- | :---: |\n` +
        surveyors
          .map(
            (s) =>
              `| **${s.name}** | \`${s.email}\` | ${s.ward?.name || "General Patrol"} | ${new Date(s.createdAt).toLocaleDateString()} |`
          )
          .join("\n") +
        `\n\n> Manage surveyor route assignments in [Route Management](/routes).`;
    } else {
      content = `### 👷 Municipal Repair Engineers (${engineers.length})\n\n` +
        `Engineers assigned for pothole cold-mix patching and civic remediation:\n\n` +
        `| Engineer Name | Email | Jurisdiction Ward | Assigned Department |\n` +
        `| :--- | :--- | :--- | :---: |\n` +
        engineers
          .map(
            (e) =>
              `| **${e.name}** | \`${e.email}\` | ${e.ward?.name || "City Central"} | ${e.department || "Pothole Remediation"} |`
          )
          .join("\n") +
        `\n\n` +
        `You can assign open issues to these engineers from the [Issue Management](/issues) dashboard.`;
    }
  }

  // 4. RECENT POTHOLES / DETECTIONS
  else if (
    q.includes("recent") ||
    q.includes("pothole") ||
    q.includes("latest") ||
    q.includes("new issue") ||
    q.includes("गड्ढे") ||
    q.includes("તાજેતર")
  ) {
    const recentList = issues.slice(0, 5);

    content = `### 🚨 Latest Detected Incidents\n\n` +
      `Here are the most recently reported road defects and civic issues in Vadodara:\n\n` +
      `| Issue Type | Location & Route | Status | Severity | Reported |\n` +
      `| :--- | :--- | :---: | :---: | :---: |\n` +
      recentList
        .map((i) => {
          const sev = i.analysis?.severity || "HIGH";
          const depth = i.analysis?.depthEstimateCm
            ? ` (${i.analysis.depthEstimateCm}cm)`
            : "";
          return `| **${i.type}** | ${i.ward?.name || "Ward"} &bull; ${i.route?.name || "Corridor"} | \`${i.status}\` | **${sev}**${depth} | ${new Date(i.createdAt).toLocaleDateString()} |`;
        })
        .join("\n") +
      `\n\n> Review before-and-after AI audits in [Resolution Verification](/verification).`;
  }

  // 5. MONSOON / RAIN / FLOOD RISK
  else if (
    q.includes("rain") ||
    q.includes("monsoon") ||
    q.includes("risk") ||
    q.includes("waterlog") ||
    q.includes("flood") ||
    q.includes("मौसम") ||
    q.includes("વરસાદ")
  ) {
    content = `### 🌧️ Vadodara Monsoon & Rain Risk Assessment\n\n` +
      `- **Overall Vulnerability Score:** **57 / 100 (HIGH RISK)**\n` +
      `- **Active Pothole Hotspots:** ${potholeIssues.filter((p) => p.status === "DETECTED").length} open road depressions prone to water ponding.\n` +
      `- **High Vulnerability Wards:** Sayajigunj (55%), Alkapuri (37%), Gotri.\n\n` +
      `**Recommended Civic Actions:**\n` +
      `1. Clear stormwater drainage grates adjacent to open pothole clusters.\n` +
      `2. Expedite cold-mix asphalt deployment to high-traffic arterial corridors.\n` +
      `3. Monitor live radar updates in [Monsoon Risk Predictor](/dashboard).`;
  }

  // 6. ROUTES / SURVEY CORRIDORS
  else if (
    q.includes("route") ||
    q.includes("corridor") ||
    q.includes("distance") ||
    q.includes("रास्ता") ||
    q.includes("રૂટ")
  ) {
    content = `### 🛣️ Municipal Survey Routes (${routes.length})\n\n` +
      `| Route Name | Ward | Distance | Assigned Surveyor | Status |\n` +
      `| :--- | :--- | :---: | :--- | :---: |\n` +
      routes
        .map((r) => {
          const surveyorName =
            r.assignments?.[0]?.surveyor?.name || "Unassigned";
          return `| **${r.name}** | ${r.ward?.name || "Ward"} | ${r.distance || 2.5} km | ${surveyorName} | \`${r.assignments?.[0]?.status || "PENDING"}\` |`;
        })
        .join("\n") +
      `\n\n> You can create and assign survey routes in [Route Management](/routes).`;
  }

  // 7. DEFAULT GENERAL CIVIC AI ASSISTANT
  else {
    content = `### 🤖 NagarSeva Smart Civic Assistant\n\n` +
      `I can assist you with real-time operational data for **Vadodara Municipal Corporation**:\n\n` +
      `- **Active Open Issues:** **${openIssues.length}** (${potholeIssues.length} potholes, ${garbageIssues.length} garbage complaints)\n` +
      `- **Administrative Wards:** **${wards.length}** wards monitored\n` +
      `- **Survey Routes:** **${routes.length}** corridors mapped\n` +
      `- **Field Force:** **${surveyors.length}** Surveyors, **${engineers.length}** Repair Engineers\n\n` +
      `**Quick Questions You Can Ask:**\n` +
      `- *"How many open issues are there?"*\n` +
      `- *"Show me issues by ward"*\n` +
      `- *"List all engineers"*\n` +
      `- *"What are the recent potholes reported?"*\n` +
      `- *"Which ward has the highest rain risk?"*`;
  }

  return {
    question,
    result: {
      content,
    },
  };
}
