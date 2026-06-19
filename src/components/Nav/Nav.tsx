import { NavLink } from "react-router-dom";
import { AccommodationIcon, FlightIcon, TimelineIcon } from "./NavIcons";
import "./Nav.css";

const navItems = [
  { to: "/", label: "行程時間軸", end: true, Icon: TimelineIcon },
  { to: "/flight", label: "飛機資訊", end: false, Icon: FlightIcon },
  { to: "/accommodation", label: "住宿資訊", end: false, Icon: AccommodationIcon },
] as const;

export function Nav() {
  return (
    <nav className="nav" aria-label="主要導覽">
      <div className="navInner">
        <NavLink to="/" className="navBrand" end>
          Trip Flow
        </NavLink>
        <ul className="navList">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `navLink${isActive ? " isActive" : ""}`
                }
              >
                <item.Icon className="navIcon" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
