import styles from './page.module.css';
import HierarchicalFilter from './HierarchicalFilter';

export default function Home() {
    return (
        <main className={styles.main}>
            <HierarchicalFilter />
        </main>
    );
}
