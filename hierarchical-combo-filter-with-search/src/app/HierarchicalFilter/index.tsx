'use client';
import {
    Box,
    Card,
    ChipButton,
    Heading,
    Space,
    SpaceVertical,
} from '@looker/components';
import {
    DashboardEvent,
    getEmbedSDK,
    ILookerConnection,
} from '@looker/embed-sdk';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import useSWR from 'swr';
import { useBoolean, useDebounceValue } from 'usehooks-ts';
import { IHierarchyValues } from '../api/filters/route';
import CheckboxPopover from './CheckboxPopover';
import { createDashboardParameterValue, toggleSelection } from './handleToggle';
import Image from 'next/image';

const DASHBOARD_PARAMETER = 'Hierarchical Filter';
const HIDE_FILTERS = ['Category', 'Brand', 'Item Name'];

const StyledCard = styled(Card)`
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    & > iframe {
        flex-grow: 1;
    }
`;

const StyledBox = styled(Box)`
    flex-grow: 1;
    height: 100%;
    & > iframe {
        height: 100%;
        width: 100%;
    }
`;

const HierarchicalFilter: React.FC = () => {
    const mounted = useBoolean(false);
    const [connection, setConnection] = useState<ILookerConnection | null>(
        null
    );
    const [debounced_search, setDebouncedSearch] = useDebounceValue('', 250);
    const [selections, setSelections] = useState<string[][]>([]);
    const popover_open = useBoolean(false);
    const spaceRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        mounted.setTrue();
        // eslint-disable-next-line
    }, []);
    const api_url = `${process.env.NEXT_PUBLIC_API_URL || ''}`;
    const search_results = useSWR(
        `${api_url}/api/filters?q=${debounced_search}`,
        (url: string) =>
            fetch(url).then((res) => res.json()) as Promise<IHierarchyValues[]>
    );

    const hideDashboardFilters = (filters: boolean, parameter: boolean) => {
        const hide_filter: string[] = [];
        if (filters) {
            hide_filter.push(...HIDE_FILTERS);
        }
        if (parameter) {
            hide_filter.push(DASHBOARD_PARAMETER);
        }
        return { hide_filter: hide_filter };
    };

    const dashboardRef = useCallback((el: HTMLDivElement) => {
        if (el && !el.children.length) {
            const lookerHostUrl = process.env.NEXT_PUBLIC_LOOKER_HOST_URL;
            if (!lookerHostUrl) {
                console.error('NEXT_PUBLIC_LOOKER_HOST_URL is not defined');
                return;
            }
            const embed_sdk = getEmbedSDK();
            const api_url = `${
                process.env.NEXT_PUBLIC_API_URL || ''
            }/api/embed`;
            embed_sdk.init(lookerHostUrl, api_url);

            embed_sdk
                .createDashboardWithId('126')
                .withParams(hideDashboardFilters(false, true))
                .appendTo(el)
                .on('dashboard:loaded', (e: DashboardEvent) => {
                    console.log(e);
                })
                .on('page:changed', (event) => {
                    console.log(event);
                })
                .build()
                .connect({ waitUntilLoaded: true })
                .then((connection: ILookerConnection) => {
                    setConnection(connection);
                })
                .catch((error: Error) => {
                    console.error('Error embedding dashboard:', error.message);
                });
        }
    }, []);

    const handleToggle = (path: string[]) => {
        setSelections((prev) => toggleSelection(prev, path));
    };

    const updateDashboardFilters = async (filters: string[][]) => {
        if (connection) {
            const dashboard_parameter_value = createDashboardParameterValue(
                filters,
                DASHBOARD_PARAMETER
            );
            const dashboard_connection = connection.asDashboardConnection();
            dashboard_connection.updateFilters(dashboard_parameter_value);
            dashboard_connection.run();
        }
    };

    if (!mounted.value) {
        return null;
    }

    return (
        <SpaceVertical gap="small" flexGrow={1}>
            <Space align="self-start">
                <Image
                    src="https://www.lkr.dev/img/lkr-dev-logo-light.svg"
                    alt="LKR Dev Logo"
                    width={404 / 4}
                    height={119 / 4}
                />
                <Heading>Hierarchical Combo Filter with Search Example</Heading>
            </Space>
            <StyledCard flexGrow={1}>
                <Space ref={spaceRef} gap="xsmall" padding="xsmall">
                    <CheckboxPopover
                        loading={search_results.isLoading}
                        open={popover_open.value}
                        updateDashboardFilters={updateDashboardFilters}
                        onClose={() => {
                            popover_open.setFalse();
                            setDebouncedSearch('');
                        }}
                        setSearchValue={(value) => {
                            setDebouncedSearch(value);
                        }}
                        searchResults={search_results.data || []}
                        search={debounced_search}
                        updateSelections={(selections) =>
                            setSelections(selections)
                        }
                        selections={selections}
                    />
                    {selections.map((selection) => {
                        const text = selection.join(' > ');
                        return (
                            <ChipButton
                                key={selection.join(' > ')}
                                onDelete={() => {
                                    handleToggle(selection);
                                }}
                            >
                                {text}
                            </ChipButton>
                        );
                    })}
                </Space>
                <StyledBox ref={dashboardRef} />
            </StyledCard>
        </SpaceVertical>
    );
};

export default HierarchicalFilter;
