import { atom } from 'nanostores';

export const sidebarStore = atom<boolean>(false);

export const toggleSidebar = () => {
  sidebarStore.set(!sidebarStore.get());
}; 