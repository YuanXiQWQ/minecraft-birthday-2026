/** Lightweight independent landing entry: no scene, game rules or Three.js import. */
import { TEXT } from './labels.ts';
import './style.css';

/** Render this experimental landing page with externalized text and a relative game link. */
function renderHome(): void {
  const home = document.getElementById('home')!;
  const note = document.createElement('p'); note.className='eyebrow'; note.textContent=TEXT.homeNote;
  const title = document.createElement('h1'); title.textContent=TEXT.homeTitle;
  const link = document.createElement('a'); link.href='./game/'; link.className='primary'; link.textContent=TEXT.enter;
  const caption = document.createElement('p'); caption.textContent=TEXT.homeWarning;
  home.append(note,title,link,caption); document.title=TEXT.homeTitle;
}
renderHome();
