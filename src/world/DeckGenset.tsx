// The genset riding on the truck: the forklift simulator's own model of the 2250 kVA set (loaded on demand),
// lengthwise on the deck's timbers.
import { Bake } from '@forklift/scene/Bake';
import { Genset } from '@forklift/scene/genset/Genset';

export default function DeckGenset({ y, z }: { y: number; z: number }) {
  return (
    <group position={[0, y, z]} rotation={[0, Math.PI / 2, 0]}>
      <Bake>
        <Genset />
      </Bake>
    </group>
  );
}
