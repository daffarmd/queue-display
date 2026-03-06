import { error, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const value = Number(params.counterId);
	if (!Number.isInteger(value) || value <= 0) {
		throw error(404, 'Loket tidak ditemukan');
	}

	throw redirect(307, `/operator?loket=${value}`);
};

