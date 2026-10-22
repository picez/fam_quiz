import { Outlet } from 'react-router-dom';
import { Menu } from './Menu';

export function WithMenu() {
  return (
    <div className="with-menu">
      <Menu />
      <Outlet />
    </div>
  );
}
