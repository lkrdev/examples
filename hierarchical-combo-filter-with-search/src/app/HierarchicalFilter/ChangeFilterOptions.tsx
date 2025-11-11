import { IconButton, Space } from '@looker/components';
import { FilterAlt, FilterList } from '@styled-icons/material';
import { useRouter, useSearchParams } from 'next/navigation';

export const ChangeFilterOptions = () => {
    const router = useRouter();
    const params = useSearchParams();
    const toggleParam = (
        param: 'show_filters' | 'show_dashboard_parameter'
    ) => {
        const searchParams = Object.fromEntries(params.entries());
        if (searchParams[param] === 'true') {
            delete searchParams[param];
        } else {
            searchParams[param] = 'true';
        }
        // router.push(
        //     `${window.location.href.split('?')[0]}?${new URLSearchParams(
        //         searchParams
        //     ).toString()}`,
        //     {}
        // );
        window.open(
            `${window.location.href.split('?')[0]}?${new URLSearchParams(
                searchParams
            ).toString()}`,
            '_self'
        );
    };

    return (
        <Space className="buttons" alignSelf="center" gap="none">
            <IconButton
                icon={<FilterAlt />}
                onClick={() => toggleParam('show_filters')}
            />
            <IconButton
                icon={<FilterList />}
                onClick={() => toggleParam('show_dashboard_parameter')}
            />
        </Space>
    );
};
