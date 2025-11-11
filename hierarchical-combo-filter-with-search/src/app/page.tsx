import { Suspense } from 'react';
import styles from './page.module.css';
import HierarchicalFilter from './HierarchicalFilter';

export default function Home() {
    return (
        <main className={styles.main}>
            <Suspense fallback={<div></div>}>
                <HierarchicalFilter />
            </Suspense>
        </main>
    );
}
