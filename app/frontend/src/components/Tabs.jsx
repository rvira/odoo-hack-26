import { NavLink } from 'react-router-dom';

const TABBG = {
  pri: ['var(--primary-soft)', 'var(--primary)'],
  env: ['var(--env-soft)', 'var(--env)'],
  soc: ['var(--soc-soft)', 'var(--soc)'],
  gov: ['var(--gov-soft)', 'var(--gov)'],
  game: ['var(--game-soft)', 'var(--game)'],
};

/** tabs: [[slug, label], ...] rendered as sub-routes of `base`.
 *  NavLink sets aria-current="page" on the active tab, which the CSS styles.
 *  accent: pillar id for pillar modules, 'pri' (Odoo purple) otherwise. */
export default function Tabs({ base, tabs, accent = 'pri', label }) {
  const [bg, ink] = TABBG[accent] || TABBG.pri;
  return (
    <nav className="tabs" style={{ '--tab-bg': bg, '--tab-ink': ink }} aria-label={label}>
      {tabs.map(([slug, name]) => (
        <NavLink key={slug} to={`${base}/${slug}`} className={() => ''}>{name}</NavLink>
      ))}
    </nav>
  );
}
