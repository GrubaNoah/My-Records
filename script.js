// ===== CONFIGURATION =====
const DISCOGS_USERNAME = 'grubanoah';
const DISCOGS_TOKEN = 'AkLGdCCPJKGYNODfFfMhfUYjBBetgGmgUxvZRupx';

// Noah's Kallax Genre Organization
const KALLAX_GENRES = {
    'Bluegrass': 'A1',
    'Country': 'A1',
    'Electronic': 'A1-B1',
    'Folk': 'B1',
    'Funk': 'B1', 
    'Hip Hop': 'B2-C2-C3-C4',
    'Indie': 'C4',
    'Jam Band': 'D1',
    'Jazz': 'D1-D2',
    'Pop': 'D2',
    'R&B': 'D2',
    'Rock': 'D4',
    'Soul': 'D4',
    'World': 'D4'
};

// ===== END CONFIGURATION =====

let allRecords = [];
let filteredRecords = [];
let displayedRecords = [];
let currentView = 'normal';
let currentGenre = 'all';
let currentSort = 'artist';

class DiscogsCollection {
    constructor() {
        this.baseUrl = 'https://api.discogs.com';
        this.headers = {
            'User-Agent': `${DISCOGS_USERNAME}/1.0 +https://example.com`,
            'Authorization': `Discogs token=${DISCOGS_TOKEN}`
        };
        this.csvRecords = {};
        this.genreLearningData = {};
        this.recordsPerCube = 60; // Default capacity
        this.positionCalculationNeeded = false;
    }

    async fetchCollection() {
        if (DISCOGS_USERNAME === 'YOUR_USERNAME_HERE' || DISCOGS_TOKEN === 'YOUR_API_TOKEN_HERE') {
            throw new Error('Please configure your Discogs username and API token');
        }

        // First, load the CSV data
        await this.loadCSVData();

        let allItems = [];
        let page = 1;
        let totalPages = 1;
        let hasMore = true;

        const progressContainer = document.getElementById('progressContainer');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        progressContainer.style.display = 'block';

        try {
            while (hasMore && page <= 10) {
                const url = `${this.baseUrl}/users/${DISCOGS_USERNAME}/collection/folders/0/releases?page=${page}&per_page=100`;

                progressText.textContent = `Loading page ${page}${totalPages > 1 ? ` of ${Math.min(totalPages, 10)}` : ''}...`;

                const response = await fetch(url, { headers: this.headers });

                if (!response.ok) {
                    if (response.status === 401) throw new Error('Invalid API token. Please check your token.');
                    if (response.status === 404) throw new Error('User not found. Please check your username.');
                    if (response.status === 429) throw new Error('Rate limit exceeded. Please try again later.');
                    throw new Error(`API Error: ${response.status}`);
                }

                const data = await response.json();
                allItems = allItems.concat(data.releases);

                if (page === 1) {
                    totalPages = Math.min(data.pagination.pages, 10);
                }

                const progress = (page / totalPages) * 100;
                progressFill.style.width = `${progress}%`;

                hasMore = page < totalPages;
                page++;

                if (page === 2) {
                    const firstBatch = allItems.slice(0, 100);
                    this.processAndDisplayRecords(firstBatch);
                }

                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            progressContainer.style.display = 'none';
            
            const processedIds = new Set(allRecords.map(r => r.id));
            const unprocessedItems = allItems.filter(item => !processedIds.has(item.basic_information.id));
            
            if (unprocessedItems.length > 0) {
                this.processAndDisplayRecords(unprocessedItems);
            }
            
            this.analyzeCollectionFormats();
            
            return allItems;

        } catch (error) {
            progressContainer.style.display = 'none';
            throw error;
        }
    }

    async loadCSVData() {
        try {
            console.log('Loading CSV data...');
            const response = await fetch('./Final_Genre-Tagged_Collection.csv');
            
            if (!response.ok) {
                throw new Error(`CSV fetch failed: ${response.status}`);
            }
            
            const csvData = await response.text();
            console.log('CSV data loaded, parsing...');
            
            // Parse CSV data - much faster parsing
            const lines = csvData.trim().split('\n');
            
            this.csvRecords = {};
            this.genreLearningData = {};
            
            // Skip header, process data rows
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split('\t');
                if (values.length < 4) continue; // Skip malformed rows
                
                const genre = values[1];
                const artist = values[2];
                const title = values[3];
                
                // Create matching key
                const key = this.createMatchingKey(artist, title);
                this.csvRecords[key] = {
                    genre: genre,
                    artist: artist,
                    title: title
                };
                
                // Build learning data
                const kallaxGenre = this.mapCSVGenreToKallax(genre);
                if (!this.genreLearningData[artist]) {
                    this.genreLearningData[artist] = {};
                }
                this.genreLearningData[artist][kallaxGenre] = (this.genreLearningData[artist][kallaxGenre] || 0) + 1;
            }
            
            console.log(`✅ CSV loaded: ${Object.keys(this.csvRecords).length} records, ${Object.keys(this.genreLearningData).length} artists`);
            
        } catch (error) {
            console.error('❌ CSV loading failed:', error);
            this.csvRecords = {};
            this.genreLearningData = {};
        }
    }

    createMatchingKey(artist, title) {
        // More aggressive cleaning for better matching
        const cleanArtist = artist
            .toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove all punctuation
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
            
        const cleanTitle = title
            .toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove all punctuation
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
            
        return `${cleanArtist}|||${cleanTitle}`;
    }

    mapCSVGenreToKallax(csvGenre) {
        // Map your CSV genres to Kallax categories
        const genreMap = {
            'Hip-Hop': 'Hip Hop',
            'Alt Rock': 'Rock',
            'Compilation': 'Unassigned', // Special handling needed
            'Synthpop': 'Pop', // You moved this to Pop
            'Latin': 'World',
            'Reggae': 'World'
        };
        
        return genreMap[csvGenre] || csvGenre;
    }

    processAndDisplayRecords(records) {
        const processedRecords = records.map(this.formatRecordData.bind(this));
        
        if (allRecords.length === 0) {
            allRecords = processedRecords;
            this.initializeUI();
            this.updateEverything();
        } else {
            const existingIds = new Set(allRecords.map(r => r.id));
            const newRecords = processedRecords.filter(r => !existingIds.has(r.id));
            
            if (newRecords.length > 0) {
                allRecords = allRecords.concat(newRecords);
                
                // REMOVED: No more popup for new records
                // const newUnassignedRecords = newRecords.filter(r => !r.fromCSV);
                // if (newUnassignedRecords.length > 0) {
                //     this.showNewRecordAssignmentModal(newUnassignedRecords);
                // }
                
                this.updateEverything();
            }
        }
    }

    formatRecordData(record) {
        const basic = record.basic_information;
        const genres = basic.genres || [];
        const styles = basic.styles || [];
        
        const artist = basic.artists ? basic.artists.map(a => a.name).join(', ') : 'Unknown Artist';
        const title = basic.title;
        
        // Quick CSV lookup
        const matchingKey = this.createMatchingKey(artist, title);
        const csvMatch = this.csvRecords[matchingKey];
        
        let assignedGenre = 'Unassigned';
        if (csvMatch) {
            assignedGenre = this.mapCSVGenreToKallax(csvMatch.genre);
        } else {
            assignedGenre = this.assignGenreFromDiscogs(genres, styles, artist);
        }
        
        return {
            id: basic.id,
            title: title,
            artist: artist,
            year: basic.year || 'Unknown',
            thumb: basic.thumb || '',
            cover_image: basic.cover_image || basic.thumb || '',
            formats: basic.formats ? basic.formats.map(f => f.name).join(', ') : '',
            date_added: record.date_added,
            genres: genres,
            styles: styles,
            kallaxGenre: assignedGenre,
            fromCSV: !!csvMatch,
            kallax_location: 'Calculating...' // Initialize with placeholder
        };
    }

    assignGenreFromDiscogs(genres, styles, artist) {
        // Quick artist lookup first
        const learnedGenre = this.genreLearningData[artist];
        if (learnedGenre) {
            const mostCommon = Object.entries(learnedGenre).sort(([,a], [,b]) => b - a)[0];
            if (mostCommon) return mostCommon[0];
        }

        // Fast genre mapping
        const allTerms = [...genres, ...styles].map(t => t.toLowerCase());
        
        // Quick mapping check - ADDED COUNTRY DETECTION
        if (allTerms.some(t => t.includes('hip hop') || t.includes('rap'))) return 'Hip Hop';
        if (allTerms.some(t => t.includes('country') || t.includes('americana') || t.includes('bluegrass'))) return 'Country';
        if (allTerms.some(t => t.includes('electronic') || t.includes('techno'))) return 'Electronic';
        if (allTerms.some(t => t.includes('rock'))) return 'Rock';
        if (allTerms.some(t => t.includes('jazz'))) return 'Jazz';
        if (allTerms.some(t => t.includes('folk') || t.includes('singer') || t.includes('acoustic'))) return 'Folk';
        if (allTerms.some(t => t.includes('funk'))) return 'Funk';
        if (allTerms.some(t => t.includes('indie') || t.includes('alternative'))) return 'Indie';
        if (allTerms.some(t => t.includes('pop'))) return 'Pop';
        if (allTerms.some(t => t.includes('soul'))) return 'Soul';
        if (allTerms.some(t => t.includes('r&b') || t.includes('rnb'))) return 'R&B';
        if (allTerms.some(t => t.includes('world') || t.includes('reggae'))) return 'World';
        if (allTerms.some(t => t.includes('jam'))) return 'Jam Band';
        
        return 'Unassigned';
    }

    predictGenreFromArtist(artist) {
        if (!this.genreLearningData[artist]) return 'Unknown';
        
        // Find the most common genre for this artist in your collection
        const artistGenres = this.genreLearningData[artist];
        const mostCommonGenre = Object.entries(artistGenres)
            .sort(([,a], [,b]) => b - a)[0];
        
        return mostCommonGenre ? mostCommonGenre[0] : 'Unknown';
    }

    buildSmartGenreMapping() {
        // Enhanced mapping based on analyzing your CSV collection
        return {
            'Bluegrass': ['bluegrass', 'newgrass'],
            'Country': ['country', 'americana', 'nashville sound'],
            'Electronic': ['electronic', 'techno', 'house', 'ambient', 'idm', 'drum n bass', 'dubstep', 'downtempo'],
            'Folk': ['folk', 'singer/songwriter', 'acoustic'],
            'Funk': ['funk', 'p-funk'],
            'Hip Hop': ['hip hop', 'hip-hop', 'rap', 'trap', 'conscious rap'],
            'Indie': ['indie', 'alternative', 'lo-fi', 'indie rock', 'indie pop'],
            'Jam Band': ['jam band', 'jam', 'psychedelic rock', 'grateful dead'],
            'Jazz': ['jazz', 'bebop', 'swing', 'fusion', 'smooth jazz', 'contemporary jazz'],
            'Pop': ['pop', 'dance', 'disco', 'synthpop', 'dance-pop'],
            'R&B': ['r&b', 'rnb', 'rhythm & blues', 'neo soul', 'contemporary r&b'],
            'Rock': ['rock', 'classic rock', 'hard rock', 'punk', 'metal', 'grunge', 'alternative rock'],
            'Soul': ['soul', 'motown', 'northern soul', 'classic soul'],
            'World': ['world', 'reggae', 'latin', 'african', 'celtic', 'international', 'world music']
        };
    }

    analyzeCollectionFormats() {
        let totalRecords = 0;
        let formatCounts = {
            single: 0,
            gatefold: 0,
            double: 0,
            triple: 0,
            boxSet: 0,
            other: 0
        };
        let formatBreakdown = {};

        allRecords.forEach(record => {
            totalRecords++;
            const formats = record.formats.toLowerCase();
            
            // Count format types
            formatBreakdown[record.formats] = (formatBreakdown[record.formats] || 0) + 1;
            
            // Categorize by thickness/space requirements
            if (formats.includes('box set') || formats.includes('boxset')) {
                formatCounts.boxSet++;
            } else if (formats.includes('3×') || formats.includes('triple') || formats.includes('3lp')) {
                formatCounts.triple++;
            } else if (formats.includes('2×') || formats.includes('double') || formats.includes('2lp')) {
                formatCounts.double++;
            } else if (formats.includes('gatefold')) {
                formatCounts.gatefold++;
            } else {
                formatCounts.single++;
            }
        });

        console.log('=== COLLECTION FORMAT ANALYSIS ===');
        console.log(`Total records: ${totalRecords}`);
        console.log(`Single LP: ${formatCounts.single}`);
        console.log(`Gatefold LP: ${formatCounts.gatefold}`);
        console.log(`Double LP (2×): ${formatCounts.double}`);
        console.log(`Triple LP (3×): ${formatCounts.triple}`);
        console.log(`Box Sets: ${formatCounts.boxSet}`);
        console.log(`Other formats: ${formatCounts.other}`);
        console.log(`Detailed format breakdown:`, formatBreakdown);

        // Calculate Kallax capacity with all format types
        this.calculateKallaxCapacity(formatCounts);
    }

    calculateKallaxCapacity(formatCounts) {
        const KALLAX_CUBE_DEPTH = 37; // cm
        const THICKNESSES = {
            single: 0.3,      // cm - standard single LP
            gatefold: 0.75,   // cm - gatefold sleeve
            double: 0.6,      // cm - 2 records, standard sleeves
            triple: 0.9,      // cm - 3 records
            boxSet: 2.5,      // cm - varies widely, conservative estimate
            other: 0.4        // cm - average for unknown formats
        };
        const MAX_RECORDS_PER_CUBE = 60; // Noah's real-world limit

        const totalRecords = Object.values(formatCounts).reduce((a, b) => a + b, 0);
        
        // Calculate weighted average thickness
        let totalThickness = 0;
        Object.keys(formatCounts).forEach(format => {
            const count = formatCounts[format];
            const thickness = THICKNESSES[format] || THICKNESSES.other;
            totalThickness += count * thickness;
        });
        
        const avgThickness = totalThickness / totalRecords;
        
        // Calculate theoretical capacity
        const theoreticalCapacity = Math.floor(KALLAX_CUBE_DEPTH / avgThickness);
        
        // Use the more conservative estimate (real-world vs theoretical)
        const recordsPerCube = Math.min(theoreticalCapacity, MAX_RECORDS_PER_CUBE);

        console.log('=== KALLAX CAPACITY CALCULATION ===');
        console.log(`Total records: ${totalRecords}`);
        console.log('Format breakdown:');
        Object.keys(formatCounts).forEach(format => {
            const count = formatCounts[format];
            const percentage = ((count / totalRecords) * 100).toFixed(1);
            console.log(`  ${format}: ${count} (${percentage}%) - ${THICKNESSES[format] || THICKNESSES.other}cm each`);
        });
        console.log(`Weighted average thickness: ${avgThickness.toFixed(2)}cm`);
        console.log(`Theoretical capacity: ${theoreticalCapacity} records per cube`);
        console.log(`Real-world limit: ${MAX_RECORDS_PER_CUBE} records per cube`);
        console.log(`Using: ${recordsPerCube} records per cube`);

        // Store for use in location algorithm
        this.recordsPerCube = recordsPerCube;
        
        // Update all record locations - OPTIMIZED VERSION
        this.updateAllKallaxLocationsOptimized();
    }

    initializeUI() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('controls').classList.add('enabled');
        document.getElementById('stats').classList.add('visible');
    }

    updateEverything() {
        this.updateStats();
        this.updateGenreFilters();
        this.filterRecords();
    }

    updateStats() {
        const currentRecords = filteredRecords.length > 0 ? filteredRecords : allRecords;
        const totalRecords = currentRecords.length;
        const totalArtists = new Set(currentRecords.map(r => r.artist)).size;
        const totalGenres = new Set([
            ...currentRecords.flatMap(r => r.genres),
            ...currentRecords.flatMap(r => r.styles)
        ]).size;

        document.getElementById('totalRecords').textContent = totalRecords;
        document.getElementById('totalArtists').textContent = totalArtists;
        document.getElementById('totalGenres').textContent = totalGenres;
    }

    updateGenreFilters() {
        // Use your exact CSV genres plus Kallax mappings - WITH COUNTRY
        const kallaxGenres = [
            'Bluegrass', 'Country', 'Electronic', 'Folk', 'Funk', 'Hip Hop', 
            'Indie', 'Jam Band', 'Jazz', 'Pop', 'R&B', 'Rock', 'Soul', 'World'
        ];
        
        const genreFilters = document.getElementById('genreFilters');
        const genreCounts = {};

        // Count records for each Kallax genre
        kallaxGenres.forEach(kallaxGenre => {
            const count = allRecords.filter(record => 
                record.kallaxGenre === kallaxGenre
            ).length;
            
            if (count > 0) {
                genreCounts[kallaxGenre] = count;
            }
        });

        // Add count for unassigned records
        const unassignedCount = allRecords.filter(record => 
            record.kallaxGenre === 'Unassigned'
        ).length;
        
        if (unassignedCount > 0) {
            genreCounts['Unassigned'] = unassignedCount;
        }

        // Create filter buttons
        genreFilters.innerHTML = `
            <button class="filter-btn ${currentGenre === 'all' ? 'active' : ''}" data-genre="all">
                All Genres
            </button>
        `;

        Object.entries(genreCounts)
            .sort(([,a], [,b]) => b - a)
            .forEach(([genre, count]) => {
                const button = document.createElement('button');
                button.className = `filter-btn ${currentGenre === genre ? 'active' : ''}`;
                button.setAttribute('data-genre', genre);
                button.textContent = `${genre} (${count})`;
                genreFilters.appendChild(button);
            });

        const filterLabel = document.getElementById('filterLabel');
        filterLabel.textContent = 'Filter by Genre';
    }

    filterRecords(searchTerm = '') {
        let filtered = allRecords;

        // Apply main genre filter using Kallax genres only
        if (currentGenre !== 'all') {
            filtered = filtered.filter(record => 
                record.kallaxGenre === currentGenre
            );
        }

        // Apply main search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(record =>
                record.artist.toLowerCase().includes(term) ||
                record.title.toLowerCase().includes(term) ||
                record.genres.some(genre => genre.toLowerCase().includes(term)) ||
                record.styles.some(style => style.toLowerCase().includes(term))
            );
        }

        filteredRecords = filtered;
        displayedRecords = filteredRecords;
        this.updateStats();
        this.sortRecords();
    }

    sortRecords() {
        const sorted = [...displayedRecords];
        
        switch (currentSort) {
            case 'artist':
                sorted.sort((a, b) => a.artist.localeCompare(b.artist));
                break;
            case 'title':
                sorted.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'year':
                sorted.sort((a, b) => {
                    const yearA = a.year === 'Unknown' ? 0 : parseInt(a.year);
                    const yearB = b.year === 'Unknown' ? 0 : parseInt(b.year);
                    return yearB - yearA;
                });
                break;
            case 'genre':
                sorted.sort((a, b) => {
                    const genreA = a.genres[0] || 'Unknown';
                    const genreB = b.genres[0] || 'Unknown';
                    return genreA.localeCompare(genreB);
                });
                break;
        }

        displayedRecords = sorted;
        this.renderRecords();
    }

    renderRecords() {
        const grid = document.getElementById('collectionGrid');
        grid.innerHTML = '';
        grid.className = `collection-grid ${currentView === 'compact' ? 'compact' : ''}`;

        if (displayedRecords.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: #888; padding: 40px;">
                    <h3>No records found</h3>
                    <p>Try adjusting your search or filter criteria</p>
                </div>
            `;
            return;
        }

        // Render all records at once to avoid spacing issues
        const fragment = document.createDocumentFragment();
        displayedRecords.forEach((record, index) => {
            const card = this.createRecordCard(record);
            card.style.animationDelay = `${Math.min(index * 0.02, 1)}s`; // Cap delay to prevent long waits
            fragment.appendChild(card);
        });
        
        grid.appendChild(fragment);
    }

    createRecordCard(record) {
        const card = document.createElement('div');
        card.className = `record-card ${currentView === 'compact' ? 'compact' : ''}`;
        card.addEventListener('click', () => this.showAlbumDetails(record.id));
        
        const imageUrl = record.cover_image || record.thumb || '';
        const imageElement = imageUrl ? 
            `<img src="${imageUrl}" alt="${record.title}" class="album-art" loading="lazy">` :
            `<div class="no-image">🎵</div>`;

        const genreTags = record.genres.slice(0, 2).map(genre => 
            `<span class="detail-tag genre-tag" data-filter="${genre}">${genre}</span>`
        ).join('');

        const yearTag = record.year !== 'Unknown' ? 
            `<span class="detail-tag" data-filter="${record.year}">${record.year}</span>` : '';

        const formatTag = record.formats ? 
            `<span class="detail-tag" data-filter="${record.formats}">${record.formats}</span>` : '';

        const kallaxTag = `<span class="detail-tag kallax-tag" data-record-id="${record.id}">${record.kallaxGenre}</span>`;

        card.innerHTML = `
            ${imageElement}
            <div class="record-info">
                <div class="artist">${record.artist}</div>
                <div class="title">${record.title}</div>
                <div class="kallax-location">📍 ${record.kallax_location || 'Calculating...'}</div>
                <div class="details">
                    ${kallaxTag}
                    ${genreTags}
                    ${yearTag}
                    ${formatTag}
                </div>
            </div>
        `;

        return card;
    }

    // OPTIMIZED VERSION - Much faster placement calculation
    updateAllKallaxLocationsOptimized() {
        console.log('🚀 Starting optimized position calculation...');
        const startTime = performance.now();
        
        // Group records by genre first
        const recordsByGenre = {};
        allRecords.forEach(record => {
            const genre = record.kallaxGenre;
            if (!recordsByGenre[genre]) {
                recordsByGenre[genre] = [];
            }
            recordsByGenre[genre].push(record);
        });

        // Sort each genre group once
        Object.keys(recordsByGenre).forEach(genre => {
            recordsByGenre[genre].sort((a, b) => {
                const artistCompare = a.artist.localeCompare(b.artist);
                if (artistCompare !== 0) return artistCompare;
                
                const yearA = a.year === 'Unknown' ? 9999 : parseInt(a.year);
                const yearB = b.year === 'Unknown' ? 9999 : parseInt(b.year);
                return yearA - yearB;
            });
        });

        // Define layout with Country in A1
        const genreLayout = [
            { genre: 'Bluegrass', cubes: ['A1'] },
            { genre: 'Country', cubes: ['A1'] },
            { genre: 'Electronic', cubes: ['A1', 'B1'] },
            { genre: 'Folk', cubes: ['B1'] },
            { genre: 'Funk', cubes: ['B1'] },
            { genre: 'Hip Hop', cubes: ['B2', 'C2', 'C3', 'C4'] },
            { genre: 'Indie', cubes: ['C4'] },
            { genre: 'Jam Band', cubes: ['D1'] },
            { genre: 'Jazz', cubes: ['D1', 'D2'] },
            { genre: 'Pop', cubes: ['D2'] },
            { genre: 'R&B', cubes: ['D2'] },
            { genre: 'Rock', cubes: ['D4'] },
            { genre: 'Soul', cubes: ['D4'] },
            { genre: 'World', cubes: ['D4'] }
        ];

        // Process each genre
        genreLayout.forEach(layout => {
            const genreRecords = recordsByGenre[layout.genre] || [];
            if (genreRecords.length === 0) return;

            let recordIndex = 0;
            layout.cubes.forEach(cube => {
                const recordsForThisCube = genreRecords.slice(
                    recordIndex, 
                    recordIndex + this.recordsPerCube
                );
                
                recordsForThisCube.forEach((record, index) => {
                    const position = index + 1;
                    record.kallax_location = `${cube}, ${position}`;
                });
                
                recordIndex += this.recordsPerCube;
            });
        });

        const endTime = performance.now();
        console.log(`✅ Position calculation completed in ${(endTime - startTime).toFixed(2)}ms`);
        
        // Mark that calculation is done
        this.positionCalculationNeeded = false;
        
        // Refresh display if needed
        if (displayedRecords.length > 0) {
            this.renderRecords();
        }
    }

    async showAlbumDetails(releaseId) {
        const modal = document.getElementById('albumModal');
        const content = document.getElementById('albumDetailsContent');
        
        content.innerHTML = '<div style="text-align: center; padding: 40px; color: #4ecdc4;">Loading album details...</div>';
        modal.style.display = 'flex';

        const albumData = await this.fetchAlbumDetails(releaseId);
        
        const imageUrl = albumData.images && albumData.images.length > 0 ? albumData.images[0].uri : '';
        const tracklist = albumData.tracklist || [];

        content.innerHTML = `
            <div class="album-details">
                <div>
                    ${imageUrl ? 
                        `<img src="${imageUrl}" alt="${albumData.title}" class="album-art-large">` :
                        `<div style="width: 200px; height: 200px; background: rgba(255,255,255,0.1); border-radius: 15px; display: flex; align-items: center; justify-content: center; font-size: 3rem; color: rgba(255,255,255,0.3);">🎵</div>`
                    }
                </div>
                <div class="album-info">
                    <h3>Album Information</h3>
                    <p><strong>Title:</strong> ${albumData.title}</p>
                    <p><strong>Artist:</strong> ${albumData.artists ? albumData.artists.map(a => a.name).join(', ') : 'Unknown'}</p>
                    <p><strong>Year:</strong> ${albumData.year || 'Unknown'}</p>
                    <p><strong>Label:</strong> ${albumData.labels ? albumData.labels.map(l => l.name).join(', ') : 'Unknown'}</p>
                    <p><strong>Format:</strong> ${albumData.formats ? albumData.formats.map(f => f.name).join(', ') : 'Unknown'}</p>
                    <p><strong>Genres:</strong> ${albumData.genres ? albumData.genres.join(', ') : 'Unknown'}</p>
                    <p><strong>Styles:</strong> ${albumData.styles ? albumData.styles.join(', ') : 'Unknown'}</p>
                    
                    ${tracklist.length > 0 ? `
                        <div class="tracklist">
                            <h4>Tracklist</h4>
                            ${tracklist.map(track => `
                                <div class="track-item">
                                    <span class="track-position">${track.position || ''}</span>
                                    <span class="track-title">${track.title}</span>
                                    <span class="track-duration">${track.duration || ''}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    async fetchAlbumDetails(releaseId) {
        const url = `${this.baseUrl}/releases/${releaseId}`;
        try {
            const response = await fetch(url, { headers: this.headers });
            if (!response.ok) throw new Error('Failed to fetch album details');
            return await response.json();
        } catch (error) {
            console.error('Error fetching album details:', error);
            return null;
        }
    }

    showNewRecordAssignmentModal(newRecords) {
        const modal = document.getElementById('newRecordModal');
        const content = document.getElementById('newRecordsList');
        
        this.pendingAssignments = {};
        
        content.innerHTML = '';
        
        newRecords.forEach(record => {
            const recordDiv = document.createElement('div');
            recordDiv.className = 'new-record-item';
            recordDiv.innerHTML = `
                <div class="new-record-info">
                    <div class="new-record-artist">${record.artist}</div>
                    <div class="new-record-title">${record.title}</div>
                    <div class="predicted-genre">Predicted: ${record.kallaxGenre}</div>
                </div>
                <div class="genre-assignment">
                    <button class="accept-btn" data-record-id="${record.id}" data-genre="${record.kallaxGenre}">
                        ✓ Accept ${record.kallaxGenre}
                    </button>
                    <select class="genre-dropdown" data-record-id="${record.id}" style="display: none;">
                        <option value="">Select Genre...</option>
                        <option value="Bluegrass">Bluegrass</option>
                        <option value="Country">Country</option>
                        <option value="Electronic">Electronic</option>
                        <option value="Folk">Folk</option>
                        <option value="Funk">Funk</option>
                        <option value="Hip Hop">Hip Hop</option>
                        <option value="Indie">Indie</option>
                        <option value="Jam Band">Jam Band</option>
                        <option value="Jazz">Jazz</option>
                        <option value="Pop">Pop</option>
                        <option value="R&B">R&B</option>
                        <option value="Rock">Rock</option>
                        <option value="Soul">Soul</option>
                        <option value="World">World</option>
                        <option value="Unassigned">Unassigned</option>
                    </select>
                    <button class="change-btn" data-record-id="${record.id}">Change</button>
                    <button class="add-new-genre" data-record-id="${record.id}" style="display: none;">+ New Genre</button>
                    <input type="text" class="new-genre-input" data-record-id="${record.id}" placeholder="Enter new genre..." style="display: none;">
                </div>
            `;
            
            // Set predicted genre as the pending assignment
            this.pendingAssignments[record.id] = record.kallaxGenre;
            
            content.appendChild(recordDiv);
        });
        
        modal.style.display = 'flex';
    }

    applyNewAssignments() {
        Object.entries(this.pendingAssignments).forEach(([recordId, assignedGenre]) => {
            const record = allRecords.find(r => r.id == recordId);
            if (record) {
                record.kallaxGenre = assignedGenre;
                
                // Learn from this assignment for future records
                if (!this.genreLearningData[record.artist]) {
                    this.genreLearningData[record.artist] = {};
                }
                this.genreLearningData[record.artist][assignedGenre] = 
                    (this.genreLearningData[record.artist][assignedGenre] || 0) + 1;
                
                console.log(`Manual assignment: ${record.artist} → ${assignedGenre} (learned for future)`);
            }
        });
        
        // Update everything with new assignments
        this.updateAllKallaxLocationsOptimized();
        this.updateGenreFilters();
        this.filterRecords();
        
        this.pendingAssignments = {};
    }

    // FIXED: Recategorize function with proper ID handling and optimization
    recategorizeRecord(recordId, newGenre) {
        console.log(`🔄 Recategorizing record ${recordId} to ${newGenre}`);
        
        // Convert recordId to number for comparison
        const numericRecordId = parseInt(recordId);
        const record = allRecords.find(r => parseInt(r.id) === numericRecordId);
        
        if (!record) {
            console.error(`❌ Record not found: ${recordId}`);
            return;
        }
        
        const oldGenre = record.kallaxGenre;
        record.kallaxGenre = newGenre;
        
        // Learn from this manual correction
        if (!this.genreLearningData[record.artist]) {
            this.genreLearningData[record.artist] = {};
        }
        this.genreLearningData[record.artist][newGenre] = 
            (this.genreLearningData[record.artist][newGenre] || 0) + 1;
        
        console.log(`✅ Recategorized: ${record.artist} - ${record.title} from ${oldGenre} → ${newGenre}`);
        
        // Only recalculate positions for affected genres (much faster!)
        this.updatePositionsForGenres([oldGenre, newGenre]);
        
        // Update display
        this.updateGenreFilters();
        this.filterRecords();
    }

    // OPTIMIZED: Only recalculate specific genres instead of entire collection
    updatePositionsForGenres(affectedGenres) {
        console.log(`🔄 Updating positions for genres: ${affectedGenres.join(', ')}`);
        const startTime = performance.now();
        
        const genreLayout = [
            { genre: 'Bluegrass', cubes: ['A1'] },
            { genre: 'Country', cubes: ['A1'] },
            { genre: 'Electronic', cubes: ['A1', 'B1'] },
            { genre: 'Folk', cubes: ['B1'] },
            { genre: 'Funk', cubes: ['B1'] },
            { genre: 'Hip Hop', cubes: ['B2', 'C2', 'C3', 'C4'] },
            { genre: 'Indie', cubes: ['C4'] },
            { genre: 'Jam Band', cubes: ['D1'] },
            { genre: 'Jazz', cubes: ['D1', 'D2'] },
            { genre: 'Pop', cubes: ['D2'] },
            { genre: 'R&B', cubes: ['D2'] },
            { genre: 'Rock', cubes: ['D4'] },
            { genre: 'Soul', cubes: ['D4'] },
            { genre: 'World', cubes: ['D4'] }
        ];

        // Only process affected genres
        const relevantLayouts = genreLayout.filter(layout => 
            affectedGenres.includes(layout.genre)
        );

        relevantLayouts.forEach(layout => {
            // Get all records for this specific genre
            const genreRecords = allRecords.filter(record => 
                record.kallaxGenre === layout.genre
            );

            // Sort: alphabetically by artist, then by release year
            genreRecords.sort((a, b) => {
                const artistCompare = a.artist.localeCompare(b.artist);
                if (artistCompare !== 0) return artistCompare;
                
                const yearA = a.year === 'Unknown' ? 9999 : parseInt(a.year);
                const yearB = b.year === 'Unknown' ? 9999 : parseInt(b.year);
                return yearA - yearB;
            });

            // Distribute across cubes for this genre
            let recordIndex = 0;
            layout.cubes.forEach(cube => {
                const recordsForThisCube = genreRecords.slice(
                    recordIndex, 
                    recordIndex + this.recordsPerCube
                );
                
                recordsForThisCube.forEach((record, index) => {
                    const position = index + 1;
                    record.kallax_location = `${cube}, ${position}`;
                });
                
                recordIndex += this.recordsPerCube;
            });
        });

        const endTime = performance.now();
        console.log(`✅ Updated positions for ${affectedGenres.length} genres in ${(endTime - startTime).toFixed(2)}ms`);
        
        // Refresh the display
        this.renderRecords();
    }
}

// Initialize the collection
let discogsCollection;

document.addEventListener('DOMContentLoaded', async () => {
    discogsCollection = new DiscogsCollection();
    
    try {
        await discogsCollection.fetchCollection();
        console.log(`Successfully loaded ${allRecords.length} records`);
        
    } catch (error) {
        console.error('Error loading collection:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').innerHTML = `
            <h3>Error Loading Collection</h3>
            <p>${error.message}</p>
        `;
    }
});

// Search functionality
document.getElementById('searchBox').addEventListener('input', (e) => {
    const searchTerm = e.target.value;
    if (discogsCollection) {
        discogsCollection.filterRecords(searchTerm);
    }
    
    const clearBtn = document.getElementById('searchClear');
    clearBtn.classList.toggle('visible', searchTerm.length > 0);
});

document.getElementById('searchClear').addEventListener('click', () => {
    document.getElementById('searchBox').value = '';
    document.getElementById('searchClear').classList.remove('visible');
    if (discogsCollection) {
        discogsCollection.filterRecords('');
    }
});

// View toggle
document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        
        if (discogsCollection) {
            discogsCollection.renderRecords();
        }
    });
});

// Genre filter
document.addEventListener('click', (e) => {
    if (e.target.matches('.filter-btn')) {
        const newGenre = e.target.dataset.genre;
        
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        currentGenre = newGenre;
        
        if (discogsCollection) {
            const searchTerm = document.getElementById('searchBox').value;
            discogsCollection.filterRecords(searchTerm);
        }
    }

    // Handle clickable tags on cards + recategorize
    if (e.target.matches('.detail-tag[data-filter]')) {
        e.stopPropagation();
        const filterValue = e.target.getAttribute('data-filter');
        document.getElementById('searchBox').value = filterValue;
        document.getElementById('searchClear').classList.add('visible');
        
        if (discogsCollection) {
            discogsCollection.filterRecords(filterValue);
        }
    }

    // FIXED: Handle recategorize clicks with proper ID handling
    if (e.target.matches('.kallax-tag[data-record-id]')) {
        e.stopPropagation();
        const recordId = e.target.getAttribute('data-record-id');
        console.log(`🔄 Opening recategorize modal for record ${recordId}`);
        showRecategorizeModal(recordId);
    }
});

// Expand genres button
document.getElementById('expandGenres').addEventListener('click', () => {
    showGenreModal();
});

// Sort buttons
document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSort = btn.dataset.sort;
        
        if (discogsCollection) {
            discogsCollection.sortRecords();
        }
    });
});

// Stats click handlers
document.getElementById('artistsStats').addEventListener('click', () => {
    showArtistModal();
});

document.getElementById('genresStats').addEventListener('click', () => {
    showGenreModal();
});

// Home title click - reset everything
document.getElementById('homeTitle').addEventListener('click', () => {
    currentGenre = 'all';
    document.getElementById('searchBox').value = '';
    document.getElementById('searchClear').classList.remove('visible');
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.filter-btn[data-genre="all"]').classList.add('active');
    
    if (discogsCollection) {
        discogsCollection.updateGenreFilters();
        discogsCollection.filterRecords();
    }
});

// Modal functions
function showArtistModal() {
    const modal = document.getElementById('artistModal');
    const content = document.getElementById('artistListContent');
    
    const currentRecords = displayedRecords.length > 0 ? displayedRecords : allRecords;
    const artistCounts = {};
    
    currentRecords.forEach(record => {
        const artist = record.artist;
        artistCounts[artist] = (artistCounts[artist] || 0) + 1;
    });

    const sortedArtists = Object.entries(artistCounts).sort((a, b) => a[0].localeCompare(b[0]));
    
    content.innerHTML = '';
    sortedArtists.forEach(([artist, count]) => {
        const artistItem = document.createElement('div');
        artistItem.className = 'artist-item';
        artistItem.innerHTML = `
            <span class="artist-name">${artist}</span>
            <span class="artist-count">${count} record${count > 1 ? 's' : ''}</span>
        `;
        artistItem.addEventListener('click', () => {
            // Filter by this artist and close modal
            document.getElementById('searchBox').value = artist;
            document.getElementById('searchClear').classList.add('visible');
            modal.style.display = 'none';
            
            if (discogsCollection) {
                discogsCollection.filterRecords(artist);
            }
        });
        content.appendChild(artistItem);
    });
    
    modal.style.display = 'flex';
}

function showGenreModal() {
    const modal = document.getElementById('genreModal');
    const content = document.getElementById('genreListContent');
    const title = document.getElementById('genreModalTitle');
    
    const currentRecords = displayedRecords.length > 0 ? displayedRecords : allRecords;
    const genreCounts = {};
    
    currentRecords.forEach(record => {
        [...record.genres, ...record.styles].forEach(genre => {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
    });

    const sortedGenres = Object.entries(genreCounts).sort((a, b) => a[0].localeCompare(b[0]));
    
    title.textContent = 'All Genres';
    content.innerHTML = '';
    
    sortedGenres.forEach(([genre, count]) => {
        const genreItem = document.createElement('div');
        genreItem.className = 'genre-item';
        genreItem.innerHTML = `
            <span class="genre-name">${genre}</span>
            <span class="genre-count">${count} record${count > 1 ? 's' : ''}</span>
        `;
        genreItem.addEventListener('click', () => {
            // Filter by this genre and close modal
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            currentGenre = genre;
            modal.style.display = 'none';
            
            if (discogsCollection) {
                discogsCollection.updateGenreFilters();
                discogsCollection.filterRecords();
            }
        });
        content.appendChild(genreItem);
    });
    
    modal.style.display = 'flex';
}

// FIXED: Recategorize modal with proper record finding
function showRecategorizeModal(recordId) {
    console.log(`🔄 Showing recategorize modal for record ${recordId}`);
    
    // Convert to number for comparison
    const numericRecordId = parseInt(recordId);
    const record = allRecords.find(r => parseInt(r.id) === numericRecordId);
    
    if (!record) {
        console.error(`❌ Record not found: ${recordId}`);
        return;
    }

    console.log(`✅ Found record: ${record.artist} - ${record.title} (${record.kallaxGenre})`);

    document.getElementById('recatArtist').textContent = record.artist;
    document.getElementById('recatTitle').textContent = record.title;
    document.getElementById('currentGenre').textContent = record.kallaxGenre;
    document.getElementById('recategorizeDropdown').value = record.kallaxGenre;
    
    // Store record ID for later
    document.getElementById('recategorizeModal').setAttribute('data-record-id', recordId);
    document.getElementById('recategorizeModal').style.display = 'flex';
}

// Modal close handlers
document.getElementById('closeArtistModal').addEventListener('click', () => {
    document.getElementById('artistModal').style.display = 'none';
});

document.getElementById('closeGenreModal').addEventListener('click', () => {
    document.getElementById('genreModal').style.display = 'none';
});

document.getElementById('closeAlbumModal').addEventListener('click', () => {
    document.getElementById('albumModal').style.display = 'none';
});

document.getElementById('closeNewRecordModal').addEventListener('click', () => {
    document.getElementById('newRecordModal').style.display = 'none';
});

document.getElementById('closeRecategorizeModal').addEventListener('click', () => {
    document.getElementById('recategorizeModal').style.display = 'none';
});

// New record assignment handlers
document.addEventListener('change', (e) => {
    if (e.target.matches('.genre-dropdown')) {
        const recordId = e.target.getAttribute('data-record-id');
        if (discogsCollection && discogsCollection.pendingAssignments) {
            discogsCollection.pendingAssignments[recordId] = e.target.value;
        }
    }
});

document.addEventListener('click', (e) => {
    if (e.target.matches('.add-new-genre')) {
        const recordId = e.target.getAttribute('data-record-id');
        const dropdown = document.querySelector(`.genre-dropdown[data-record-id="${recordId}"]`);
        const input = document.querySelector(`.new-genre-input[data-record-id="${recordId}"]`);
        const changeBtn = document.querySelector(`.change-btn[data-record-id="${recordId}"]`);
        
        dropdown.style.display = 'none';
        changeBtn.style.display = 'none';
        e.target.style.display = 'none';
        input.style.display = 'block';
        input.focus();
    }

    // Handle accept button clicks
    if (e.target.matches('.accept-btn')) {
        const recordId = e.target.getAttribute('data-record-id');
        const genre = e.target.getAttribute('data-genre');
        
        if (discogsCollection && discogsCollection.pendingAssignments) {
            discogsCollection.pendingAssignments[recordId] = genre;
        }
        
        // Visual feedback
        e.target.classList.add('accepted');
        e.target.textContent = `✓ Accepted: ${genre}`;
        e.target.style.pointerEvents = 'none';
        
        // Hide change button
        const changeBtn = document.querySelector(`.change-btn[data-record-id="${recordId}"]`);
        if (changeBtn) changeBtn.style.display = 'none';
    }

    // Handle change button clicks
    if (e.target.matches('.change-btn')) {
        const recordId = e.target.getAttribute('data-record-id');
        const dropdown = document.querySelector(`.genre-dropdown[data-record-id="${recordId}"]`);
        const addBtn = document.querySelector(`.add-new-genre[data-record-id="${recordId}"]`);
        const acceptBtn = document.querySelector(`.accept-btn[data-record-id="${recordId}"]`);
        
        // Show dropdown and add button, hide accept and change buttons
        dropdown.style.display = 'block';
        addBtn.style.display = 'block';
        acceptBtn.style.display = 'none';
        e.target.style.display = 'none';
        
        // Set dropdown to current prediction
        const currentGenre = acceptBtn.getAttribute('data-genre');
        dropdown.value = currentGenre;
    }
});

document.addEventListener('keypress', (e) => {
    if (e.target.matches('.new-genre-input') && e.key === 'Enter') {
        const recordId = e.target.getAttribute('data-record-id');
        const newGenre = e.target.value.trim();
        
        if (newGenre && discogsCollection && discogsCollection.pendingAssignments) {
            discogsCollection.pendingAssignments[recordId] = newGenre;
            
            // Add to dropdown for future use
            const dropdown = document.querySelector(`.genre-dropdown[data-record-id="${recordId}"]`);
            const option = document.createElement('option');
            option.value = newGenre;
            option.textContent = newGenre;
            option.selected = true;
            dropdown.appendChild(option);
            
            // Show dropdown again
            dropdown.style.display = 'block';
            e.target.style.display = 'none';
            document.querySelector(`.add-new-genre[data-record-id="${recordId}"]`).style.display = 'block';
        }
    }
});

document.getElementById('saveNewAssignments').addEventListener('click', () => {
    if (discogsCollection && discogsCollection.pendingAssignments) {
        discogsCollection.applyNewAssignments();
        document.getElementById('newRecordModal').style.display = 'none';
    }
});

document.getElementById('skipNewAssignments').addEventListener('click', () => {
    document.getElementById('newRecordModal').style.display = 'none';
});

// FIXED: Recategorize modal handlers with proper functionality
document.getElementById('cancelRecategorize').addEventListener('click', () => {
    document.getElementById('recategorizeModal').style.display = 'none';
});

document.getElementById('saveRecategorize').addEventListener('click', () => {
    const recordId = document.getElementById('recategorizeModal').getAttribute('data-record-id');
    const newGenre = document.getElementById('recategorizeDropdown').value || 
                   document.getElementById('recatNewInput').value.trim();
    
    console.log(`💾 Saving recategorization: Record ${recordId} → ${newGenre}`);
    
    if (newGenre && discogsCollection) {
        discogsCollection.recategorizeRecord(recordId, newGenre);
        document.getElementById('recategorizeModal').style.display = 'none';
        console.log(`✅ Recategorization saved successfully`);
    } else {
        console.error(`❌ Cannot save: newGenre="${newGenre}", discogsCollection exists: ${!!discogsCollection}`);
    }
});

document.getElementById('recatAddNew').addEventListener('click', () => {
    document.getElementById('recategorizeDropdown').style.display = 'none';
    document.getElementById('recatAddNew').style.display = 'none';
    document.getElementById('recatNewInput').style.display = 'block';
    document.getElementById('recatNewInput').focus();
});

document.getElementById('recatNewInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const newGenre = e.target.value.trim();
        if (newGenre) {
            // Add to dropdown
            const dropdown = document.getElementById('recategorizeDropdown');
            const option = document.createElement('option');
            option.value = newGenre;
            option.textContent = newGenre;
            option.selected = true;
            dropdown.appendChild(option);
            
            // Show dropdown again
            dropdown.style.display = 'block';
            e.target.style.display = 'none';
            document.getElementById('recatAddNew').style.display = 'block';
        }
    }
});

// Close modals when clicking outside
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
});
