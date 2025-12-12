// upload_test.js (same content I gave before)
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || ''
});

async function test() {
    try {
        const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAUAAYkC8kQAAAAASUVORK5CYII=';
        const buffer = Buffer.from(b64, 'base64');

        const url = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({ folder: 'nri_realestate_test' }, (err, res) => {
                if (err) return reject(err);
                resolve(res && res.secure_url);
            });
            stream.end(buffer);
        });

        console.log('Upload test succeeded. URL:', url);
    } catch (err) {
        console.error('Upload test FAILED:', err);
    }
}

test();
