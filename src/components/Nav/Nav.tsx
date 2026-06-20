import { useEffect, useId, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useTripOptional } from "../../trip/TripContext";
import {
  AccommodationIcon,
  CloseIcon,
  FlightIcon,
  MenuIcon,
  TicketIcon,
  TimelineIcon,
} from "./NavIcons";
import { tokens } from "../../styles/tokens";
import "./Nav.css";

const overviewNavItems = [
  { to: "/", label: "我的旅行", end: true, Icon: TimelineIcon },
] as const;

function buildTripNavItems(tripSlug: string) {
  return [
    { to: `/${tripSlug}`, label: "行程時間軸", end: true, Icon: TimelineIcon },
    { to: `/${tripSlug}/flight`, label: "飛機資訊", end: false, Icon: FlightIcon },
    {
      to: `/${tripSlug}/accommodation`,
      label: "住宿資訊",
      end: false,
      Icon: AccommodationIcon,
    },
    { to: `/${tripSlug}/ticket`, label: "票券", end: false, Icon: TicketIcon },
  ] as const;
}

function NavLinks({
  className,
  onNavigate,
  items,
}: {
  className?: string;
  onNavigate?: () => void;
  items: ReadonlyArray<{
    to: string;
    label: string;
    end: boolean;
    Icon: typeof TimelineIcon;
  }>;
}) {
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) => `navLink${isActive ? " isActive" : ""}`}
            onClick={onNavigate}
          >
            <item.Icon className="navIcon" />
            <span>{item.label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function Nav() {
  const tripContext = useTripOptional();
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarId = useId();
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuActive, setMenuActive] = useState(false);

  const navItems = useMemo(() => {
    if (tripContext?.slug) {
      return buildTripNavItems(tripContext.slug);
    }
    return overviewNavItems;
  }, [tripContext?.slug]);

  const brandLabel = tripContext?.trip?.displayName ?? "Trip Flow";
  const brandTo = tripContext?.slug ? `/${tripContext.slug}` : "/";

  async function handleLogout() {
    await signOut();
    navigate("/", { replace: true });
  }

  function openMenu() {
    setMenuMounted(true);
  }

  function closeMenu() {
    setMenuActive(false);
  }

  function toggleMenu() {
    if (menuMounted) {
      closeMenu();
      return;
    }

    openMenu();
  }

  function handleSidebarTransitionEnd(event: React.TransitionEvent<HTMLElement>) {
    if (event.propertyName !== "transform" || menuActive) return;
    setMenuMounted(false);
  }

  useEffect(() => {
    closeMenu();
  }, [location.pathname]);

  useEffect(() => {
    if (!menuMounted) {
      setMenuActive(false);
      return;
    }

    const frame = requestAnimationFrame(() => {
      setMenuActive(true);
    });

    return () => cancelAnimationFrame(frame);
  }, [menuMounted]);

  useEffect(() => {
    if (menuActive || !menuMounted) return;

    const timer = window.setTimeout(() => {
      setMenuMounted(false);
    }, tokens.sidebarAnimationMs);

    return () => clearTimeout(timer);
  }, [menuActive, menuMounted]);

  useEffect(() => {
    if (!menuMounted) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuMounted]);

  return (
    <>
      <nav className="nav" aria-label="主要導覽">
        <div className="navInner">
          <div className="navLeft">
            <button
              type="button"
              className="navMenuButton"
              aria-label={menuActive ? "關閉選單" : "開啟選單"}
              aria-expanded={menuActive}
              aria-controls={sidebarId}
              onClick={toggleMenu}
            >
              {menuActive ? <CloseIcon /> : <MenuIcon />}
            </button>

            <NavLink to={brandTo} className="navBrand" end>
              {brandLabel}
            </NavLink>

            {tripContext?.slug ? (
              <Link to="/" className="navBackToOverview">
                所有旅行
              </Link>
            ) : null}
          </div>

          <div className="navRight">
            <NavLinks className="navList navListDesktop" items={navItems} />

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

      {menuMounted ? (
        <>
          <button
            type="button"
            className={`navOverlay${menuActive ? " isOpen" : ""}`}
            aria-label="關閉選單"
            onClick={closeMenu}
          />
          <aside
            id={sidebarId}
            className={`navSidebar${menuActive ? " isOpen" : ""}`}
            aria-label="導覽選單"
            onTransitionEnd={handleSidebarTransitionEnd}
          >
            <div className="navSidebarHeader">
              <span className="navSidebarTitle">選單</span>
              <button
                type="button"
                className="navSidebarClose"
                aria-label="關閉選單"
                onClick={closeMenu}
              >
                <CloseIcon />
              </button>
            </div>
            <NavLinks
              className="navList navListSidebar"
              onNavigate={closeMenu}
              items={navItems}
            />
          </aside>
        </>
      ) : null}
    </>
  );
}
