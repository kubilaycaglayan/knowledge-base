import { readFileSync } from 'node:fs';

const resource = name => readFileSync(`${process.cwd()}/../backend/src/main/resources/static/connect/openai/${name}`, 'utf8');

it('keeps OAuth palettes identical to the application tokens', () => {
  const app = readFileSync(`${process.cwd()}/src/theme.css`, 'utf8').split('/* Menus are teleported')[0].trim();
  expect(resource('theme.css').split('\n').slice(1).join('\n').trim()).toBe(app);
});

it('follows system changes by default and persists the standard theme cycle', () => {
  localStorage.clear();
  document.body.innerHTML = '<button class="theme-toggle"></button>';
  let change = () => {};
  const media = { matches: true, addEventListener: (_, listener) => { change = listener; } };
  vi.stubGlobal('matchMedia', () => media);
  window.eval(resource('theme.js'));
  document.dispatchEvent(new Event('DOMContentLoaded'));
  expect(document.documentElement.dataset.theme).toBe('dark');
  media.matches = false;
  change();
  expect(document.documentElement.dataset.theme).toBe('light');
  const button = document.querySelector('button');
  button.click();
  expect(localStorage.getItem('knowledge-base-theme')).toBe('dark');
  expect(document.documentElement.style.colorScheme).toBe('dark');
  button.click();
  expect(document.documentElement.dataset.theme).toBe('light');
  button.click();
  expect(localStorage.getItem('knowledge-base-theme')).toBe('auto');
  media.matches = true;
  change();
  expect(document.documentElement.dataset.theme).toBe('dark');
  vi.unstubAllGlobals();
});
