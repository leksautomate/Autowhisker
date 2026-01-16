
import express from 'express';
import cors from 'cors';
import { Whisk } from '@rohitaryal/whisk-api';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from root
// Load env from root
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config(); // fallback

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for large cookie JSON

// Serve generated images statically
const outputDir = path.join(__dirname, '../output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}
app.use('/output', express.static(outputDir));

/**
 * Convert JSON cookie array (from browser extension) to cookie header string
 * Input: [{ name: "foo", value: "bar" }, ...]
 * Output: "foo=bar; baz=qux; ..."
 */
function convertCookieToString(cookieInput) {
    // If it's already a string (header format), return as-is
    if (typeof cookieInput === 'string') {
        // Check if it looks like JSON
        const trimmed = cookieInput.trim();
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map(c => `${c.name}=${c.value}`).join('; ');
                }
            } catch (e) {
                // Not valid JSON, assume it's already a cookie string
                return cookieInput;
            }
        }
        return cookieInput;
    }

    // If it's already an array
    if (Array.isArray(cookieInput)) {
        return cookieInput.map(c => `${c.name}=${c.value}`).join('; ');
    }

    return cookieInput;
}

// API Endpoint to Generate Image
app.post('/api/generate', async (req, res) => {
    const { prompt, cookie, aspectRatio = 'LANDSCAPE' } = req.body;

    if (!cookie) {
        return res.status(400).json({ error: 'Cookie is required' });
    }
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    // Convert cookie to string format if needed
    const cookieString = convertCookieToString(cookie);
    console.log('[Server] Cookie format:', typeof cookie, '-> converted to string');

    // Initialize Whisk with provided cookie
    const whisk = new Whisk(cookieString);

    console.log(`[Server] Generating: "${prompt}" (${aspectRatio})`);

    // Map aspect ratio to API format
    const aspectMap = {
        'LANDSCAPE': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
        'PORTRAIT': 'IMAGE_ASPECT_RATIO_PORTRAIT',
        'SQUARE': 'IMAGE_ASPECT_RATIO_SQUARE'
    };
    const apiAspect = aspectMap[aspectRatio] || 'IMAGE_ASPECT_RATIO_LANDSCAPE';

    try {
        // 1. Create a project context (required by API)
        console.log('[Server] Creating project...');
        const project = await whisk.newProject("Auto Whisk Generator");

        // 2. Generate image with correct API signature
        console.log('[Server] Generating image...');
        const media = await project.generateImage({
            prompt: prompt,
            aspectRatio: apiAspect
        });

        // 3. Save to disk
        console.log('[Server] Saving to disk...');
        const savedPath = media.save(outputDir);
        console.log('[Server] Image saved at:', savedPath);

        // Get filename from path
        const filename = path.basename(savedPath);
        const imageUrl = `http://localhost:${PORT}/output/${filename}`;

        res.json({
            success: true,
            message: 'Image generated',
            result: {
                url: imageUrl,
                path: savedPath,
                mediaId: media.id
            }
        });
    } catch (error) {
        console.error('[Server] Generation Error:');
        console.error('  Message:', error.message);
        console.error('  Stack:', error.stack);
        if (error.response) {
            console.error('  Response Status:', error.response.status);
            console.error('  Response Data:', error.response.data);
        }
        res.status(500).json({ error: error.message || 'Generation failed' });
    }
});

// API to check status or list files
app.get('/api/images', (req, res) => {
    try {
        if (!fs.existsSync(outputDir)) {
            return res.json([]);
        }
        const files = fs.readdirSync(outputDir)
            .filter(f => f.match(/\.(png|jpg|jpeg|webp)$/))
            .map(f => ({
                url: `http://localhost:${PORT}/output/${f}`,
                name: f,
                time: fs.statSync(path.join(outputDir, f)).mtime
            }))
            .sort((a, b) => b.time - a.time); // Newest first

        res.json(files);
    } catch (err) {
        console.error('Error listing images:', err);
        res.json([]);
    }
});

// API to clear all images
app.delete('/api/images', (req, res) => {
    try {
        if (fs.existsSync(outputDir)) {
            // Force delete the directory and everything in it
            fs.rmSync(outputDir, { recursive: true, force: true });
            // Recreate it immediately
            fs.mkdirSync(outputDir, { recursive: true });
        }
        res.json({ success: true, message: 'All images deleted' });
    } catch (err) {
        console.error('Error deleting images:', err);
        res.status(500).json({ error: 'Failed to delete images' });
    }
});

// API to validate cookie / check session status
app.post('/api/validate-cookie', async (req, res) => {
    const { cookie } = req.body;

    if (!cookie) {
        return res.status(400).json({ valid: false, error: 'Cookie is required' });
    }

    const cookieString = convertCookieToString(cookie);

    try {
        // Try to create a Whisk instance and a project to validate the cookie
        const whisk = new Whisk(cookieString);
        const project = await whisk.newProject("Session Check");

        // If we got here, the cookie is valid
        res.json({
            valid: true,
            status: 'Connected',
            message: 'Cookie is valid and session is active'
        });
    } catch (error) {
        console.error('[Server] Cookie validation error:', error.message);

        // Check for specific error messages
        let status = 'Invalid';
        let message = error.message;

        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            status = 'Expired';
            message = 'Cookie has expired. Please get a new cookie.';
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
            status = 'Blocked';
            message = 'Access denied. Try using a VPN or check your account.';
        } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
            status = 'Network Error';
            message = 'Cannot connect to Google servers.';
        }

        res.json({
            valid: false,
            status,
            message,
            error: error.message
        });
    }
});

// Download endpoint with proper Content-Disposition header
app.get('/api/download/:filename', (req, res) => {
    const { filename } = req.params;
    const { name } = req.query; // Custom download name

    const filePath = path.join(outputDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const downloadName = name || filename;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.sendFile(filePath);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});


