const prompts = {
  Codex: "Read the BrandPreflight setup skill at {skillUrl} and follow it to install and configure BrandPreflight for this project. Then tell me when it is ready to review a sponsored video.",
  "Claude Code": "Read the BrandPreflight setup skill at {skillUrl} and follow it to install and configure the BrandPreflight MCP workflow for this project. Then tell me when it is ready to review a sponsored video.",
  Cursor: "Read the BrandPreflight setup skill at {skillUrl} and set up its MCP server for this workspace. Then tell me when BrandPreflight is ready to review a sponsored video.",
  "Any MCP agent": "Read the BrandPreflight setup skill at {skillUrl} and configure its MCP server for this workspace. Then confirm it is ready to review a sponsored video."
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
