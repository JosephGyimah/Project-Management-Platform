import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const projects = [
  { name: 'Atlas launch', tasks: '12 tasks', progress: 68, tone: 'violet' },
  { name: 'Website refresh', tasks: '8 tasks', progress: 42, tone: 'blue' },
  { name: 'Q4 planning', tasks: '5 tasks', progress: 24, tone: 'orange' }
];

function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>atlas</span></div>
        <nav aria-label="Primary navigation">
          <a className="nav-item active" href="#overview"><span>◈</span>Overview</a>
          <a className="nav-item" href="#projects"><span>□</span>Projects</a>
          <a className="nav-item" href="#inbox"><span>◎</span>Inbox <b>4</b></a>
          <a className="nav-item" href="#calendar"><span>▦</span>Calendar</a>
        </nav>
        <div className="sidebar-footer"><div className="avatar">JG</div><div><strong>Joseph Gyimah</strong><small>Product lead</small></div><span className="dots">•••</span></div>
      </aside>
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">Friday, September 25, 2026</p><h1>Good morning, Joseph<span>.</span></h1></div><button className="new-button">＋ New project</button></header>
        <section className="hero-row"><div><p className="section-label">Your workspace</p><h2>Make room for<br /><em>good work.</em></h2></div><div className="focus-card"><div className="focus-icon">✦</div><div><span>Focus for today</span><strong>Ship the project brief</strong><small>Due today · Atlas launch</small></div><button aria-label="Open focus">↗</button></div></section>
        <section className="stats"><div><span>Active projects</span><strong>03</strong><small>↑ 1 this month</small></div><div><span>Open tasks</span><strong>25</strong><small>↓ 8% from last week</small></div><div><span>Due this week</span><strong>07</strong><small className="warning">2 need attention</small></div></section>
        <section className="project-section" id="projects"><div className="section-heading"><div><p className="section-label">In motion</p><h3>Your projects</h3></div><a href="#all">View all <span>→</span></a></div><div className="project-grid">{projects.map((project) => <article className="project-card" key={project.name}><div className={`project-art ${project.tone}`}><span>↗</span></div><div className="project-info"><div className="project-title"><h4>{project.name}</h4><button aria-label={`More options for ${project.name}`}>•••</button></div><p>{project.tasks}</p><div className="progress"><span style={{ width: `${project.progress}%` }} /></div><small>{project.progress}% complete</small></div></article>)}</div></section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
