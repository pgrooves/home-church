/* Entry point. Remotion loads this file, and everything it can render is
   registered from here. See src/Root.jsx. */

import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
