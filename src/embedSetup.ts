// Imported first: tell every simulator it is a zone of the world before any of its modules run.
import { EMBED as crane } from '@crane/embed';
import { EMBED as excavator } from '@excavator/embed';
import { EMBED as forklift } from '@forklift/embed';
import { EMBED as genset } from '@genset/embed';
import { EMBED as tractor } from '@tractor/embed';

for (const e of [forklift, crane, excavator, tractor, genset]) {
  e.on = true;
  e.input = false;
}
