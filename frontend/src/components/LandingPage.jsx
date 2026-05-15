import React from 'react';
import Sandbox from './Sandbox';
import { GitMerge, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import './LandingPage.css';

export default function LandingPage({ onEnterApp }) {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="logo">
          <GitMerge className="text-primary" size={28} />
          <span className="logo-text">PEACE<span className="text-primary">MAKER</span></span>
        </div>
        <nav className="landing-nav">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#docs">Documentation</a>
          <button className="btn btn-secondary" onClick={onEnterApp}>
            Go to Dashboard <ArrowRight size={16} />
          </button>
        </nav>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-content">
            <div className="hero-badge animate-fade-in">
              <ShieldCheck size={16} className="text-success" />
              <span>Safe Merge Integration V3</span>
            </div>
            <h1 className="hero-title animate-fade-in" style={{ animationDelay: '100ms' }}>
              Transform Risky Merges into <br />
              <span className="text-gradient">Guided Integration Workflows</span>
            </h1>
            <p className="hero-subtitle animate-fade-in" style={{ animationDelay: '200ms' }}>
              Peacemaker detects divergence, explains risks, proposes reconciliation, and prepares merge-ready pull requests before CI executes. Stop hoping your merge works.
            </p>
            <div className="hero-actions animate-fade-in" style={{ animationDelay: '300ms' }}>
              <button className="btn btn-primary btn-lg" onClick={onEnterApp}>
                Start Analysis <ArrowRight size={18} />
              </button>
              <a href="#sandbox" className="btn btn-secondary btn-lg">
                Try the Sandbox
              </a>
            </div>
            
            <div className="hero-features animate-fade-in" style={{ animationDelay: '400ms' }}>
              <div className="feature-item">
                <Zap size={20} className="text-primary" />
                <span>AI-Assisted Resolution</span>
              </div>
              <div className="feature-item">
                <ShieldCheck size={20} className="text-success" />
                <span>Pre-CI Validation</span>
              </div>
              <div className="feature-item">
                <GitMerge size={20} className="text-info" />
                <span>Interactive Approval</span>
              </div>
            </div>
          </div>
        </section>

        <section id="sandbox" className="sandbox-section">
          <div className="section-header">
            <h2>Experience the <span className="text-gradient">AI Guidance Layer</span></h2>
            <p>Paste your conflicting code below to see how Peacemaker resolves it.</p>
          </div>
          <Sandbox />
        </section>
      </main>
      
      <footer className="landing-footer">
        <p>&copy; 2026 Peacemaker Project. All rights reserved.</p>
      </footer>
    </div>
  );
}
