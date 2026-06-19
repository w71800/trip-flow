import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  AccommodationIcon,
  FlightIcon,
  TicketIcon,
  TimelineIcon,
} from "./NavIcons";
import "./Nav.css";

const navItems = [
  { to: "/", label: "行程時間軸", end: true, Icon: TimelineIcon },
  { to: "/flight", label: "飛機資訊", end: false, Icon: FlightIcon },
  { to: "/accommodation", label: "住宿資訊", end: false, Icon: AccommodationIcon },
  { to: "/ticket", label: "票券", end: false, Icon: TicketIcon },
] as const;

export function Nav() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <nav className="nav" aria-label="主要導覽">
      <div className="navInner">
        <NavLink to="/" className="navBrand" end>
          Trip Flow
        </NavLink>

        <div className="navRight">
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

          <div className="navAuth">
            {session ? (
              <>
                <span className="navUser">{session.user.displayName}</span>
                <button type="button" className="navAuthButton" onClick={handleLogout}>
                  登出
                </button>
              </>
            ) : (
              <Link to="/login" className="navAuthButton navAuthLink">
                登入
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
