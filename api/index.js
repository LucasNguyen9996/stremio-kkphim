const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const axios = require('axios');

const API_BASE = 'https://phimapi.com';

const manifest = {
    id: 'org.kkphim.lucas',
    version: '1.0.0',
    name: 'KKPhim Việt Nam',
    description: 'Kho Phim Việt Nam, TVB & Vietsub dành riêng cho Stremio',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: [
        { type: 'movie', id: 'kkphim_movies', name: 'KKPhim - Phim Lẻ' },
        { type: 'series', id: 'kkphim_series', name: 'KKPhim - Phim Bộ (TVB)' }
    ],
    idPrefixes: ['kk_']
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type }) => {
    try {
        const path = type === 'movie' ? 'phim-le' : 'phim-bo';
        const response = await axios.get(`${API_BASE}/v1/api/danh-sach/${path}?page=1`);
        const items = response.data?.data?.items || [];
        const metas = items.map(item => ({
            id: `kk_${item.slug}`,
            type: type,
            name: item.name,
            poster: item.poster_url?.startsWith('http') ? item.poster_url : `https://phimimg.com/${item.poster_url}`,
            description: `Năm: ${item.year}`
        }));
        return { metas };
    } catch (e) {
        return { metas: [] };
    }
});

builder.defineMetaHandler(async ({ type, id }) => {
    const slug = id.replace('kk_', '');
    try {
        const response = await axios.get(`${API_BASE}/phim/${slug}`);
        const movie = response.data.movie;
        const episodes = response.data.episodes || [];
        const meta = {
            id, type,
            name: movie.name,
            poster: movie.poster_url,
            background: movie.thumb_url,
            description: movie.content?.replace(/<[^>]*>?/gm, '') || '',
            releaseInfo: String(movie.year)
        };
        if (type === 'series' && episodes.length > 0) {
            const videoList = [];
            episodes.forEach(server => {
                server.server_data.forEach((ep, idx) => {
                    videoList.push({
                        id: `kk_${slug}:${server.server_name}:${ep.slug}`,
                        title: `${ep.name} (${server.server_name})`,
                        season: 1, episode: idx + 1
                    });
                });
            });
            meta.videos = videoList;
        }
        return { meta };
    } catch (e) {
        return { meta: null };
    }
});

builder.defineStreamHandler(async ({ id }) => {
    try {
        let slug, serverName, epSlug;
        if (id.includes(':')) {
            const parts = id.replace('kk_', '').split(':');
            slug = parts[0]; serverName = parts[1]; epSlug = parts[2];
        } else {
            slug = id.replace('kk_', '');
        }
        const response = await axios.get(`${API_BASE}/phim/${slug}`);
        const episodes = response.data.episodes || [];
        const streams = [];
        episodes.forEach(server => {
            if (!serverName || server.server_name === serverName) {
                server.server_data.forEach(ep => {
                    if (!epSlug || ep.slug === epSlug) {
                        if (ep.link_m3u8) {
                            streams.push({
                                title: `[KKPhim] ${server.server_name} - ${ep.name}`,
                                type: 'hls',
                                url: ep.link_m3u8
                            });
                        }
                    }
                });
            }
        });
        return { streams };
    } catch (e) {
        return { streams: [] };
    }
});

const addonInterface = builder.getInterface();
const router = getRouter(addonInterface);

module.exports = (req, res) => {
    router(req, res, () => {
        res.statusCode = 404;
        res.end();
    });
};
