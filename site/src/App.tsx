import { useEffect, useMemo, useState } from 'react';
import {
  AGENTS,
  buildPromptPresentation,
  buildSetupPrompt,
  featureCards,
  workflowSteps
} from './content';
import type { AgentName } from './content';
import { SplineHero } from './SplineHero';

type CopyTarget = 'hero' | 'setup' | 'final';

const GITHUB_URL = 'https://github.com/mastercoder26/ytautomation';

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();

  const copied = document.execCommand('copy');
  textArea.remove();

  if (!copied) {
    throw new Error('Clipboard access is unavailable.');
  }
}

function BrandMark() {
  return (
    <span className="wordmark">
      brand<span>preflight</span>
    </span>
  );
}

function TerminalWindow({ final = false, skillUrl }: { final?: boolean; skillUrl: string }) {
  return (
    <div className={`terminal-window${final ? ' terminal-window-final' : ''}`}>
      <div className="terminal-bar">
        <span className="terminal-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{final ? 'brandpreflight' : 'your coding agent'}</span>
        <span className="terminal-status">live</span>
      </div>
      <code className="terminal-code">
        <span className="terminal-prompt">you</span>{' '}
        {final ? (
          <>
            Read <span className="terminal-highlight">{skillUrl}</span> and set up
            BrandPreflight.
            <br />
            <br />
            <span className="terminal-prompt">agent</span>{' '}
            <strong>✓</strong> Setup complete. Attach a brief and finished video when
            you’re ready.
          </>
        ) : (
          <>
            Use BrandPreflight to review this sponsored video against the attached
            campaign brief.
            <br />
            <br />
            <span className="terminal-prompt">agent</span>{' '}
            <strong>✓</strong> 92 / ready <span className="terminal-separator">·</span>{' '}
            signed report saved
          </>
        )}
      </code>
    </div>
  );
}

function CopyButton({
  target,
  copiedTarget,
  copyFailed,
  onCopy
}: {
  target: CopyTarget;
  copiedTarget: CopyTarget | null;
  copyFailed: boolean;
  onCopy: (target: CopyTarget) => void;
}) {
  const isCopied = copiedTarget === target;

  return (
    <button type="button" className="copy-button" onClick={() => onCopy(target)}>
      {isCopied ? 'Copied — paste it into your agent' : copyFailed ? 'Try copying again' : 'Copy setup prompt'}
      <span aria-hidden="true">{isCopied ? '✓' : '↗'}</span>
    </button>
  );
}

function CenteredPrompt({
  label,
  prompt,
  copied,
  copyFailed,
  onCopy
}: {
  label: string;
  prompt: string;
  copied: boolean;
  copyFailed: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="centered-prompt" role="group" aria-label="BrandPreflight setup prompt">
      <p className="centered-prompt-label">{label}</p>
      <code className="centered-prompt-code">{prompt}</code>
      <button type="button" className="centered-prompt-button" onClick={onCopy}>
        {copied ? 'Copied — paste it into your agent' : copyFailed ? 'Try copying again' : 'Copy prompt'}
        <span aria-hidden="true">{copied ? '✓' : '↗'}</span>
      </button>
    </div>
  );
}

export default function App() {
  const [selectedAgent, setSelectedAgent] = useState<AgentName>('Codex');
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(true);
  const skillUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/skill.md';
    }

    return new URL('/skill.md', window.location.origin).toString();
  }, []);
  const setupPrompt = useMemo(
    () => buildSetupPrompt(selectedAgent, skillUrl),
    [selectedAgent, skillUrl]
  );
  const promptPresentation = useMemo(
    () => buildPromptPresentation(selectedAgent, skillUrl),
    [selectedAgent, skillUrl]
  );

  useEffect(() => {
    const updateScrollButton = () => {
      setShowScrollButton(window.scrollY === 0);
    };

    window.addEventListener('scroll', updateScrollButton, { passive: true });
    updateScrollButton();

    return () => window.removeEventListener('scroll', updateScrollButton);
  }, []);

  const handleCopy = async (target: CopyTarget) => {
    setCopyFailed(false);

    try {
      await copyText(setupPrompt);
      setCopiedTarget(target);
      window.setTimeout(() => {
        setCopiedTarget((currentTarget) =>
          currentTarget === target ? null : currentTarget
        );
      }, 1800);
    } catch {
      setCopiedTarget(null);
      setCopyFailed(true);
    }
  };

  const handleAgentChange = (agent: AgentName) => {
    setSelectedAgent(agent);
    setCopiedTarget(null);
    setCopyFailed(false);
  };

  return (
    <div className="app-shell">
      <main>
        <SplineHero>
          <a className="home-logo" href="#top" aria-label="BrandPreflight home">
            <BrandMark />
          </a>
          <CenteredPrompt
            label={promptPresentation.label}
            prompt={promptPresentation.prompt}
            copied={copiedTarget === 'hero'}
            copyFailed={copyFailed}
            onCopy={() => handleCopy('hero')}
          />
          {showScrollButton && (
            <a className="portfolio-scroll-button" href="#setup">
              <span>Scroll</span>
              <span aria-hidden="true">↘</span>
            </a>
          )}
        </SplineHero>

        <section className="setup-section section-light" id="setup">
          <div className="shell">
            <div className="section-index">01 / one prompt, one setup</div>
            <div className="section-heading setup-heading">
              <h2>
                Choose your agent.
                <br />
                <em>Copy one line.</em>
              </h2>
              <p>
                It installs BrandPreflight, completes the private setup steps, and leaves
                your agent ready to review.
              </p>
            </div>

            <div className="setup-panel">
              <div className="agent-tabs" role="tablist" aria-label="Agent setup instructions">
                {AGENTS.map((agent) => (
                  <button
                    key={agent}
                    type="button"
                    role="tab"
                    aria-selected={selectedAgent === agent}
                    className={selectedAgent === agent ? 'active' : ''}
                    onClick={() => handleAgentChange(agent)}
                  >
                    {agent}
                  </button>
                ))}
              </div>
              <div className="copy-card">
                <div className="copy-card-copy">
                  <div className="copy-label">
                    Paste this into <strong>{selectedAgent}</strong>
                  </div>
                  <pre>{setupPrompt}</pre>
                </div>
                <CopyButton
                  target="setup"
                  copiedTarget={copiedTarget}
                  copyFailed={copyFailed}
                  onCopy={handleCopy}
                />
              </div>
              <p className="setup-hint">
                No plugin marketplace. No Docker media runtime. Just two portable skills
                and a report CLI.
              </p>
            </div>
          </div>
        </section>

        <section className="workflow-section section-dark" id="workflow">
          <div className="shell">
            <div className="section-index section-index-light">02 / the review, without the plumbing</div>
            <div className="section-heading workflow-heading">
              <h2>
                Two attachments.
                <br />
                <em>One useful answer.</em>
              </h2>
              <p>
                Every review follows the same evidence trail, so the next edit is obvious
                before the video goes live.
              </p>
            </div>
            <div className="workflow-list">
              {workflowSteps.map((step) => (
                <article key={step.number} className="workflow-step">
                  <span className="step-number">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <span className="step-arrow" aria-hidden="true">↘</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="report-section section-cream">
          <div className="shell report-layout">
            <div className="report-copy">
              <div className="section-index">what the agent cannot fake</div>
              <h2>
                The model brings observations.
                <br />
                <em>BrandPreflight brings the verdict.</em>
              </h2>
              <p>
                Findings are bound to known requirements, reviewed duration, signed
                manifests, and extracted frame timestamps. The model never supplies the
                score.
              </p>
              <a className="text-link" href="/skill.md">
                Read the hosted skill <span>↗</span>
              </a>
            </div>
            <div className="report-card" aria-label="Example campaign readiness report">
              <div className="report-card-top">
                <span>Campaign readiness</span>
                <strong>signed</strong>
              </div>
              <div className="report-score-row">
                <strong>92</strong>
                <span className="report-ready">Ready</span>
              </div>
              <hr />
              <div className="report-row">
                <span>Disclosure</span>
                <strong>✓ 00:01</strong>
              </div>
              <div className="report-row">
                <span>Logo visibility</span>
                <strong className="report-risk">! revise 00:12</strong>
              </div>
              <div className="report-row">
                <span>Promo code</span>
                <strong>✓ 00:37</strong>
              </div>
              <div className="report-card-foot">
                <span>manifest / 6b2c...e91</span>
                <span>v0.2</span>
              </div>
            </div>
          </div>
        </section>

        <section className="features-section section-light">
          <div className="shell">
            <div className="section-index">built for the hand-off</div>
            <div className="features-heading">
              <h2>
                Everything a brand review needs.
                <br />
                <em>Nothing a creator has to assemble.</em>
              </h2>
            </div>
            <div className="feature-grid">
              {featureCards.map((feature) => (
                <article key={feature.number} className="feature-card">
                  <span className="feature-number">{feature.number}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="final-section section-dark">
          <div className="shell final-content">
            <TerminalWindow final skillUrl={skillUrl} />
            <div className="final-heading">
              <div className="section-index section-index-light">ready when you are</div>
              <h2>
                Get your agent ready
                <br />
                <em>before your video ships.</em>
              </h2>
              <CopyButton
                target="final"
                copiedTarget={copiedTarget}
                copyFailed={copyFailed}
                onCopy={handleCopy}
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer section-dark">
        <div className="shell footer-inner">
          <a className="brand-link" href="#top" aria-label="BrandPreflight home">
            <BrandMark />
          </a>
          <span className="footer-note">Local-first campaign QA for sponsored video.</span>
          <a href="/skill.md">Hosted skill</a>
          <a href="https://www.npmjs.com/package/brandpreflight" target="_blank" rel="noreferrer">
            npm ↗
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
      </footer>
    </div>
  );
}
