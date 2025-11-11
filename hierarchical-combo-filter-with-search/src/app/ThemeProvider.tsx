'use client';

import { ComponentsProvider } from '@looker/components';

function Providers({ children }: { children: React.ReactNode }) {
    return <ComponentsProvider>{children}</ComponentsProvider>;
}

export default Providers;
