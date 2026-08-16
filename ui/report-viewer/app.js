const add = (list, text) => { const item = document.createElement("li"); item.textContent = text; list.append(item); };
const data = await fetch("/report.json", { cache: "no-store" }).then((response) => response.json());
document.querySelector("#title").textContent = `Campaign ${data.report.campaignId}`;
document.querySelector("#score").textContent = data.report.score;
document.querySelector("#verdict").textContent = data.report.verdict.replace("_", " ");
data.report.requirements.forEach((item) => add(document.querySelector("#requirements"), `${item.status}: ${item.description}${item.recommendedChange ? ` — ${item.recommendedChange}` : ""}`));
[...data.report.limitations, ...data.limitations].forEach((item) => add(document.querySelector("#limitations"), item));
