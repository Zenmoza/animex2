const express = require('express');
const fs = require('fs-extra');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 80;
const DB_PATH = path.join(__dirname, 'database.json');
const API_KEY_PATH = path.join(__dirname, 'apikeys.json');

const sendApi = {}
sendApi.status = 200;
sendApi.message = "Sukses";
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
// Fungsi untuk mereset total hits
const resetApiKeyHits = async () => {
    try {
        const apiKeys = await fs.readJson(API_KEY_PATH);
        
        // Reset hits menjadi 0 untuk setiap API key
        apiKeys.forEach(apiKey => {
            apiKey.hits = 0;
        });

        // Simpan kembali ke file
        await fs.writeJson(API_KEY_PATH, apiKeys);
        console.log('Total hits telah di-reset menjadi 0.');
    } catch (error) {
        console.error('Error saat mereset total hits:', error);
    }
};

// Atur interval untuk mereset setiap 12 jam (12 * 60 * 60 * 1000 ms)
setInterval(resetApiKeyHits, 12 * 60 * 60 * 1000);

// Middleware untuk memeriksa API key
const checkApiKey = async (req, res, next) => {
    const apiKey = req.headers['x-api-key']; // Mengambil API key dari header

    if (!apiKey) {
        return res.status(400).json({ message: 'API key is required' });
    }

    try {
        const apiKeys = await fs.readJson(API_KEY_PATH);
        const apiKeyData = apiKeys.find(key => key.key === apiKey);

        if (!apiKeyData) {
            return res.status(404).json({ message: 'API key not found' });
        }

        // Jika API key adalah VIP, lanjutkan tanpa batasan hits
        if (apiKeyData.isVIP) {
            req.apiKeyData = apiKeyData; // Simpan data API key ke request untuk digunakan nanti
            return next(); // Lanjutkan ke endpoint berikutnya
        }

        // Jika bukan VIP, periksa batasan hits
        if (apiKeyData.hits > 0) {
            apiKeyData.hits--; // Kurangi hits
            await fs.writeJson(API_KEY_PATH, apiKeys); // Simpan perubahan hits
            req.apiKeyData = apiKeyData; // Simpan data API key ke request untuk digunakan nanti
            return next(); // Lanjutkan ke endpoint berikutnya
        } else {
            return res.status(429).json({ message: 'API key has exceeded the hit limit' });
        }
    } catch (error) {
        return res.status(500).json({ message: 'Error validating API key', error: error.message });
    }
};

// Contoh penggunaan middleware pada endpoint
app.get('/some-endpoint', checkApiKey, (req, res) => {
    res.json({ message: 'Access granted', apiKeyData: req.apiKeyData });
});

// Contoh endpoint lain
app.get('/cek', checkApiKey, async (req, res) => {
    const apiKeyData = req.apiKeyData; // Data API key yang sudah disimpan di request

    if (!apiKeyData.isVIP) {
        return res.status(403).json({ message: 'This API key is not a VIP key' });
    }

    const expirationDate = new Date(apiKeyData.expiration);
    const currentDate = new Date();
    
    // Hitung sisa waktu dalam milidetik
    const timeRemaining = expirationDate - currentDate;

    if (timeRemaining > 0) {
        const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24)); // Menghitung sisa hari
        res.json({
            message: 'API key is valid',
            expirationDate: expirationDate,
            daysRemaining: daysRemaining
        });
    } else {
        res.status(410).json({ message: 'API key has expired' });
    }
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'homepage.html'));
});
// Endpoint untuk mendapatkan semua postingan anime
app.get('/home', checkApiKey, async (req, res) => {
    const data = await fs.readJson(DB_PATH);
    res.json(data);
});

// Endpoint untuk mendapatkan anime berdasarkan ID
app.get('/anime/:id', checkApiKey, async (req, res) => {
    const data = await fs.readJson(DB_PATH);
    const anime = data.find(a => a.id === req.params.id);
    res.json(anime || { message: 'Anime not found' });
});

// Endpoint untuk mendapatkan daftar genre
app.get('/genre', checkApiKey, async (req, res) => {
    const data = await fs.readJson(DB_PATH);
    const genres = [...new Set(data.map(a => a.genre))];
    res.json(genres);
});

// Endpoint untuk mendapatkan postingan berdasarkan genre
app.get('/genre/:genre', checkApiKey, async (req, res) => {
    const data = await fs.readJson(DB_PATH);
    const filtered = data.filter(a => a.genre === req.params.genre);
    res.json(filtered);
});

// Endpoint untuk mencari anime berdasarkan judul
app.get('/search', checkApiKey, async (req, res) => {
    const { title } = req.query;
    const data = await fs.readJson(DB_PATH);
    const results = data.filter(a => a.title.toLowerCase().includes(title.toLowerCase()));
    sendApi.result = results;
    res.send(sendApi);
});

// Endpoint untuk menambah postingan
app.post('/add_post', checkApiKey, async (req, res) => {
    const newPost = req.body;
    const data = await fs.readJson(DB_PATH);
    data.push(newPost);
    await fs.writeJson(DB_PATH, data);
    res.status(201).json(newPost);
});

// Endpoint untuk mengupdate postingan berdasarkan ID
app.put('/update_post/:id', checkApiKey, async (req, res) => {
    const { id } = req.params;
    const updatedPost = req.body;
    const data = await fs.readJson(DB_PATH);
    const index = data.findIndex(a => a.id === id);
    if (index !== -1) {
        data[index] = { ...data[index], ...updatedPost };
        await fs.writeJson(DB_PATH, data);
        res.json(data[index]);
    } else {
        res.status(404).json({ message: 'Anime not found' });
    }
});

// Endpoint untuk menghapus postingan berdasarkan ID
app.delete('/delete_post/:id', checkApiKey, async (req, res) => {
    const { id } = req.params;
    const data = await fs.readJson(DB_PATH);
    const filtered = data.filter(a => a.id !== id);
    await fs.writeJson(DB_PATH, filtered);
    res.status(204).send();
});

app.post('/generate-api', async (req, res) => {
    const apiKey = Math.random().toString(36).substring(2, 15);
    const apiKeys = await fs.readJson(API_KEY_PATH);
    apiKeys.push({ key: apiKey, hits: 10, isVIP: false });
    await fs.writeJson(API_KEY_PATH, apiKeys);
    res.json({ apiKey });
});

// Endpoint untuk membuat API key VIP
app.post('/generate-vip', async (req, res) => {
    const apiKey = Math.random().toString(36).substring(2, 15);
    const expirationDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 hari dari sekarang
    const apiKeys = await fs.readJson(API_KEY_PATH);
    apiKeys.push({ key: apiKey, hits: null, isVIP: true, expiration: expirationDate });
    await fs.writeJson(API_KEY_PATH, apiKeys);
    res.json({ apiKey, expiration: expirationDate });
});

// Endpoint untuk mereset hits berdasarkan API key
app.post('/reset-hits', async (req, res) => {
    const { apiKey } = req.body;

    if (!apiKey) {
        return res.status(400).json({ message: 'API key is required' });
    }

    try {
        const apiKeys = await fs.readJson(API_KEY_PATH);
        const apiKeyData = apiKeys.find(key => key.key === apiKey);

        if (apiKeyData) {
            if (!apiKeyData.isVIP) {
                apiKeyData.hits = 10; // Reset hits ke 10 hanya untuk non-VIP
            }
            await fs.writeJson(API_KEY_PATH, apiKeys);
            return res.json({ message: 'Hits reset successfully' });
        } else {
            return res.status(404).json({ message: 'API key not found' });
        }
    } catch (error) {
        return res.status(500).json({ message: 'Error resetting hits', error: error.message });
    }
});

// Endpoint untuk menampilkan dokumentasi API
app.get('/docs', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// Jalankan server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
