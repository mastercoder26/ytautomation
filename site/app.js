const prompts = {
  Codex: "Install the BrandPreflight skill from https://github.com/mastercoder26/ytautomation. Then read {skillUrl}, finish the setup, and tell me when you are ready to review a sponsored video.",
  "Claude Code": "Install the BrandPreflight skill from https://github.com/mastercoder26/ytautomation. Then read {skillUrl}, finish the setup, and tell me when you are ready to review a sponsored video.",
  Cursor: "Install the BrandPreflight skill from https://github.com/mastercoder26/ytautomation. Then read {skillUrl}, finish the setup, and tell me when you are ready to review a sponsored video.",
  "Other agent": "Install the BrandPreflight skill from https://github.com/mastercoder26/ytautomation. Then read {skillUrl}, finish the setup, and tell me when you are ready to review a sponsored video."
};
let selectedAgent = "Codex";
const skillUrl = `${window.location.origin}/skill.md`;
const promptFor = (agent) => prompts[agent].replace("{skillUrl}", skillUrl);
const promptElement = document.querySelector("#setup-prompt");
const agentElement = document.querySelector("#agent-name");
const setAgent = (agent) => {
  selectedAgent = agent;
  promptElement.textContent = promptFor(agent);
  agentElement.textContent = agent;
  document.querySelectorAll(".agent-tabs button").forEach((button) => {
    const active = button.dataset.agent === agent;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
};
const copy = async (button) => {
  await navigator.clipboard.writeText(promptFor(selectedAgent));
  const label = button.innerHTML;
  button.textContent = "Copied — paste it into your agent";
  window.setTimeout(() => { button.innerHTML = label; }, 1800);
};
document.querySelectorAll(".agent-tabs button").forEach((button) => button.addEventListener("click", () => setAgent(button.dataset.agent)));
document.querySelector("#copy-setup").addEventListener("click", (event) => copy(event.currentTarget));
document.querySelector("#copy-final").addEventListener("click", (event) => copy(event.currentTarget));
document.querySelector("#skill-url").textContent = skillUrl;
setAgent(selectedAgent);
