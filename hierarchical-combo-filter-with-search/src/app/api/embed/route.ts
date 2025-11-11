import { USER_ID_COOKIE } from '@/app/constants';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { LookerNodeSDK } from '@looker/sdk-node';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const src = searchParams.get('src');
    if (!src) {
        return NextResponse.json(
            { error: 'url in src param is required' },
            { status: 400 }
        );
    }
    try {
        const sdk = LookerNodeSDK.init40();
        const cookie_store = await cookies();
        let user_id = await cookie_store.get(USER_ID_COOKIE)?.value;

        if (!user_id) {
            user_id = Math.random().toString(36).substring(2, 15);
        }
        const embed_url = await sdk.ok(
            sdk.create_sso_embed_url({
                external_user_id: user_id,
                permissions: ['access_data', 'see_user_dashboards'],
                external_group_id: 'hierarchical-combo-filter-with-search',
                models: ['thelook'],
                target_url: `${process.env.NEXT_PUBLIC_LOOKER_HOST_URL}${src}`,
                session_length: 60 * 60 * 24 * 30, // 30 days
            })
        );
        console.log(embed_url);

        const response = NextResponse.json(embed_url);

        if (!cookie_store.get(USER_ID_COOKIE)) {
            response.cookies.set(USER_ID_COOKIE, user_id, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 24 * 365, // 1 year
            });
        }

        return response;
    } catch (error) {
        console.error('Looker embed error:', error);
        return NextResponse.json(
            {
                error: 'Failed to generate embed URL',
                details:
                    error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
