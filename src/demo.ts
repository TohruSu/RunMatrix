import first from './demo/01-baseline.xml?raw';
import second from './demo/02-session-change.xml?raw';
import third from './demo/03-checkout-change.xml?raw';
import fourth from './demo/04-gateway-update.xml?raw';
import fifth from './demo/05-latest.xml?raw';
import { parseBatch } from './parser';

export const demoSources = [
  { name: '01-baseline.xml', xml: first },
  { name: '02-session-change.xml', xml: second },
  { name: '03-checkout-change.xml', xml: third },
  { name: '04-gateway-update.xml', xml: fourth },
  { name: '05-latest.xml', xml: fifth },
];

export function loadDemo() { return parseBatch(demoSources); }

export function shouldLoadDemo(hostname: string) {
  return hostname === 'tohrusu.github.io';
}
