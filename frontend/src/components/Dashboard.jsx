import React, { useState } from 'react';
import { 
  ArrowLeft, GitMerge, CheckCircle, AlertTriangle, 
  FileWarning, FileSignature, Check, X, ShieldAlert 
} from 'lucide-react';
import EditorPkg from 'react-simple-code-editor';
const Editor = EditorPkg.default || EditorPkg;
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import './Dashboard.css';

const mockIssues = [
  {
    id: 1,
    type: 'conflict',
    title: 'Merge Conflict',
    file: 'src/components/Button.js',
    status: 'pending',
    confidence: 87,
    riskLevel: 'Low',
    reasoning: [
      "Feature branch added animation wrapper.",
      "Target branch updated button variant system.",
      "Changes are structurally compatible."
    ],
    featureCode: "function Button({ children, variant }) {\n  return (\n    <motion.button className={`btn btn-${variant}`}>\n      {children}\n    </motion.button>\n  );\n}",
    targetCode: "function Button({ children, variant, size }) {\n  return (\n    <button className={`btn btn-${variant} btn-${size}`}>\n      {children}\n    </button>\n  );\n}",
    suggestedCode: "function Button({ children, variant, size }) {\n  return (\n    <motion.button className={`btn btn-${variant} btn-${size}`}>\n      {children}\n    </motion.button>\n  );\n}"
  },
  {
    id: 2,
    type: 'import',
    title: 'Broken Import Path',
    file: 'src/utils/api.js',
    status: 'pending',
    confidence: 95,
    riskLevel: 'Low',
    reasoning: [
      "Import path './helpers/request' no longer exists.",
      "File was moved to './core/http/request' in main branch."
    ],
    featureCode: "import { request } from './helpers/request';",
    targetCode: "import { request } from './core/http/request';",
    suggestedCode: "import { request } from './core/http/request';"
  },
  {
    id: 3,
    type: 'syntax',
    title: 'Syntax Error',
    file: 'src/components/Animation.js',
    status: 'resolved',
    confidence: 92,
    riskLevel: 'Medium',
    reasoning: [
      "Missing closing brace at line 78.",
      "Added closing brace after animation definition."
    ],
    featureCode: "const fade = { opacity: 1",
    targetCode: "",
    suggestedCode: "const fade = { opacity: 1 };"
  }
];

export default function Dashboard({ onBack }) {
  const [issues, setIssues] = useState(mockIssues);
  const [activeIssueId, setActiveIssueId] = useState(1);
  const [showPreValidation, setShowPreValidation] = useState(false);

  const activeIssue = issues.find(i => i.id === activeIssueId);
  const pendingCount = issues.filter(i => i.status === 'pending').length;

  const handleResolve = (id) => {
    setIssues(issues.map(i => i.id === id ? { ...i, status: 'resolved' } : i));
  };

  const getIssueIcon = (type) => {
    switch (type) {
      case 'conflict': return <GitMerge size={16} className="text-warning" />;
      case 'import': return <FileWarning size={16} className="text-info" />;
      case 'syntax': return <FileSignature size={16} className="text-error" />;
      default: return <AlertTriangle size={16} />;
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <button className="btn-icon" onClick={onBack} title="Back to Landing">
            <ArrowLeft size={18} />
          </button>
          <h3>Issue Navigator</h3>
          <div className="badge badge-warning">{pendingCount} Pending</div>
        </div>
        
        <div className="issue-list">
          {issues.map(issue => (
            <div 
              key={issue.id} 
              className={"issue-item " + (activeIssueId === issue.id ? 'active' : '') + " " + issue.status}
              onClick={() => setActiveIssueId(issue.id)}
            >
              <div className="issue-icon-wrapper">
                {issue.status === 'resolved' ? (
                  <CheckCircle size={16} className="text-success" />
                ) : (
                  getIssueIcon(issue.type)
                )}
              </div>
              <div className="issue-details">
                <span className="issue-title">{issue.title}</span>
                <span className="issue-file">{issue.file}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-main">
        <header className="main-header glass-panel">
          <div className="branch-info">
            <div className="branch-pill feature">feature/ui-animations</div>
            <ArrowLeft size={14} className="text-muted" style={{ transform: 'rotate(180deg)' }} />
            <div className="branch-pill target">main</div>
          </div>
          
          <div className="divergence-stats">
            <div className="stat">
              <span className="stat-label">Commits Ahead</span>
              <span className="stat-value text-success">3</span>
            </div>
            <div className="stat">
              <span className="stat-label">Commits Behind</span>
              <span className="stat-value text-warning">20</span>
            </div>
            <div className="stat risk-assessment">
              <ShieldAlert size={16} className="text-warning" />
              <span>Risk: <strong>Moderate</strong></span>
            </div>
          </div>
        </header>

        {activeIssue && (
          <div className="resolution-viewer animate-fade-in">
            <div className="ai-panel glass-panel">
              <div className="panel-header">
                <h3>AI Guidance</h3>
                <div className="confidence-badge">
                  <svg viewBox="0 0 36 36" className="circular-chart small green">
                    <path className="circle-bg" d="M18 2a16 16 0 1 1 0 32 16 16 0 1 1 0-32"/>
                    <path className="circle" strokeDasharray={activeIssue.confidence + ", 100"} d="M18 2a16 16 0 1 1 0 32 16 16 0 1 1 0-32"/>
                  </svg>
                  <span>{activeIssue.confidence}% Confidence</span>
                </div>
              </div>
              <div className="reasoning-list">
                {activeIssue.reasoning.map((text, idx) => (
                  <div key={idx} className="reasoning-item">
                    <Check size={14} className="text-success shrink-0" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="diff-viewer">
              <div className="editor-pane source-pane">
                <div className="pane-header">Feature Branch</div>
                <Editor
                  value={activeIssue.featureCode}
                  onValueChange={() => {}}
                  highlight={code => Prism.highlight(code, Prism.languages.javascript, 'javascript')}
                  padding={15}
                  className="code-editor readonly"
                  style={{ fontFamily: '"Fira Code", monospace', fontSize: 13 }}
                />
              </div>
              <div className="editor-pane target-pane">
                <div className="pane-header">Target Branch</div>
                <Editor
                  value={activeIssue.targetCode}
                  onValueChange={() => {}}
                  highlight={code => Prism.highlight(code, Prism.languages.javascript, 'javascript')}
                  padding={15}
                  className="code-editor readonly"
                  style={{ fontFamily: '"Fira Code", monospace', fontSize: 13 }}
                />
              </div>
            </div>
            
            <div className="editor-pane suggestion-pane glass-panel-elevated">
              <div className="pane-header success-header">
                <Check size={16} /> Suggested Resolution
              </div>
              <Editor
                value={activeIssue.suggestedCode}
                onValueChange={() => {}}
                highlight={code => Prism.highlight(code, Prism.languages.javascript, 'javascript')}
                padding={15}
                className="code-editor"
                style={{ fontFamily: '"Fira Code", monospace', fontSize: 14 }}
              />
            </div>
          </div>
        )}

        {/* Floating Action Bar */}
        <div className="action-bar-container">
          <div className="action-bar glass-panel-elevated">
            {pendingCount === 0 ? (
              <button className="btn btn-primary btn-lg w-full" onClick={() => setShowPreValidation(true)}>
                Run Pre-Validation Check <ArrowLeft size={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
            ) : (
              <>
                <button className="btn btn-danger" onClick={() => {}}>
                  <X size={16} /> Reject Suggestion
                </button>
                <div className="action-group">
                  <button className="btn btn-secondary" onClick={() => {}}>Edit Manually</button>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => handleResolve(activeIssueId)}
                    disabled={activeIssue?.status === 'resolved'}
                  >
                    <Check size={16} /> {activeIssue?.status === 'resolved' ? 'Resolved' : 'Accept Suggestion'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Pre-Validation Modal */}
      {showPreValidation && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content glass-panel-elevated">
            <h2>Pre-Validation Report</h2>
            <div className="report-items">
              <div className="report-item success">
                <CheckCircle size={20} />
                <div>
                  <h4>Syntax Validation</h4>
                  <p>14 files checked, 0 errors</p>
                </div>
              </div>
              <div className="report-item success">
                <CheckCircle size={20} />
                <div>
                  <h4>Import Resolution</h4>
                  <p>47 imports validated, 0 broken</p>
                </div>
              </div>
              <div className="report-item success">
                <CheckCircle size={20} />
                <div>
                  <h4>Dependency Check</h4>
                  <p>All packages exist</p>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowPreValidation(false)}>Close</button>
              <button className="btn btn-primary">
                Complete Merge Workflow <Check size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
