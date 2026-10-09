// ============================================================================
// React + htm, sem build. O htm lê o template literal e chama React.createElement
// — a mesma escrita do JSX, servida direto da pasta (veja MIGRACAO-REACT.md).
// React, ReactDOM e htm chegam como globais pelos <script> de js/vendor/.
// ============================================================================
export const html = htm.bind(React.createElement);
export const { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect, Fragment } = React;
export const { createRoot } = ReactDOM;
