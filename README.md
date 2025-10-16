PTV Unified API
A FastAPI backend for unified access to IPTV channel, language, country, subdivision, and city data.
Includes endpoints for searching, filtering, and validating IPTV streams, with support for pagination and metadata.

Features
Languages, Countries, Subdivisions, Cities: Query and search available playlists and metadata.
Channels: Paginated, searchable, and optionally validated list of IPTV channels.
Validation: Background validation of channel URLs for working status and HLS compatibility.
CORS: Ready for frontend integration (Vite, React, etc.).
Caching: Local cache for fast repeated queries.
