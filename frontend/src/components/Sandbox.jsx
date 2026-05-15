import React, { useState } from 'react';
import EditorPkg from 'react-simple-code-editor';
const Editor = EditorPkg.default || EditorPkg;
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism-tomorrow.css';
import { Play, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import './Sandbox.css';

const initialFeatureCode = `function Button({ children, variant }) {
  // Feature branch added animation
  return (
    <motion.button 
      className={"btn btn-" + variant}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {children}
    </motion.button>
  );
}`;

const initialTargetCode = `function Button({ children, variant, size }) {
  // Target branch added size variants
  return (
    <button className={"btn btn-" + variant + " btn-" + size}>
      {children}
    </button>
  );
}`;

const suggestedCode = `function Button({ children, variant, size }) {
  // Peacemaker merged both: animations + sizes
  return (
    <motion.button 
      className={"btn btn-" + variant + " btn-" + size}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {children}
    </motion.button>
  );
}`;

export default function Sandbox() {
  const [featureCode, setFeatureCode] = useState(initialFeatureCode);
  const [targetCode, setTargetCode] = useState(initialTargetCode);
  const [isResolving, setIsResolving] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const handleRunPeacemaker = () => {
    setIsResolving(true);
    // Simulate AI processing time
    setTimeout(() => {
      setIsResolving(false);
      setShowResult(true);
    }, 2000);
  };

  const handleReset = () => {
    setShowResult(false);
    setFeatureCode(initialFeatureCode);
    setTargetCode(initialTargetCode);
  };

  return (
    <div className="sandbox-container glass-panel-elevated">
      <div className="sandbox-header">
        <div className="sandbox-title">
          <AlertTriangle size={18} className="text-warning" />
          <span>Interactive Merge Sandbox</span>
        </div>
        <div className="sandbox-actions">
          {!showResult ? (
            <button 
              className="btn btn-primary" 
              onClick={handleRunPeacemaker}
              disabled={isResolving}
            >
              {isResolving ? (
                <span className="animate-pulse">Analyzing Intent...</span>
              ) : (
                <>
                  <Play size={16} /> Resolve with AI
                </>
              )}
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={handleReset}>
              Reset Sandbox
            </button>
          )}
        </div>
      </div>

      <div className="sandbox-body">
        {!showResult ? (
          <div className="split-view">
            <div className="editor-pane">
              <div className="pane-header">Feature Branch (Yours)</div>
              <Editor
                value={featureCode}
                onValueChange={code => setFeatureCode(code)}
                highlight={code => Prism.highlight(code, Prism.languages.javascript, 'javascript')}
                padding={15}
                className="code-editor"
                style={{
                  fontFamily: '"Fira Code", monospace',
                  fontSize: 14,
                }}
              />
            </div>
            <div className="editor-pane">
              <div className="pane-header">Target Branch (Main)</div>
              <Editor
                value={targetCode}
                onValueChange={code => setTargetCode(code)}
                highlight={code => Prism.highlight(code, Prism.languages.javascript, 'javascript')}
                padding={15}
                className="code-editor"
                style={{
                  fontFamily: '"Fira Code", monospace',
                  fontSize: 14,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="result-view animate-fade-in">
            <div className="ai-reasoning glass-panel">
              <div className="reasoning-header">
                <div className="confidence-score">
                  <svg viewBox="0 0 36 36" className="circular-chart green">
                    <path className="circle-bg"
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path className="circle"
                      strokeDasharray="94, 100"
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <text x="18" y="20.35" className="percentage">94%</text>
                  </svg>
                  <span>Confidence</span>
                </div>
                <div className="reasoning-text">
                  <h4>AI Reasoning</h4>
                  <ul>
                    <li><Check size={14} className="text-success" /> Feature branch added <code>motion.button</code> for animations.</li>
                    <li><Check size={14} className="text-success" /> Target branch added <code>size</code> prop and class variant.</li>
                    <li><ArrowRight size={14} className="text-info" /> Both intents are compatible. Merged by applying sizes to the motion component.</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="editor-pane resolved-pane">
              <div className="pane-header success-header">
                <Check size={16} /> Resolved Code
              </div>
              <Editor
                value={suggestedCode}
                onValueChange={() => {}}
                highlight={code => Prism.highlight(code, Prism.languages.javascript, 'javascript')}
                padding={15}
                className="code-editor"
                style={{
                  fontFamily: '"Fira Code", monospace',
                  fontSize: 14,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
