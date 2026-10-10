import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGE_DIRECTORY = path.join(
    __dirname,
    "images"
);

const IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp"
};

const IMAGE_ID_PATTERN =
    /^[a-f0-9-]{36}$/i;

export async function storeImage({
    mimeType,
    data
}) {
    const extension = IMAGE_TYPES[mimeType];

    if (!extension) {
        throw new Error(
            "Unsupported image type."
        );
    }

    if (
        typeof data !== "string" ||
        data.length === 0
    ) {
        throw new Error(
            "Image data is missing."
        );
    }

    const imageBuffer = Buffer.from(
        data,
        "base64"
    );

    if (imageBuffer.length === 0) {
        throw new Error(
            "Image data is invalid."
        );
    }

    if (imageBuffer.length > 10 * 1024 * 1024) {
        throw new Error(
            "Stored image is too large."
        );
    }

    await fs.mkdir(
        IMAGE_DIRECTORY,
        { recursive: true }
    );

    const id = crypto.randomUUID();
    const filename = `${id}${extension}`;
    const filePath = path.join(
        IMAGE_DIRECTORY,
        filename
    );

    await fs.writeFile(
        filePath,
        imageBuffer
    );

    return {
        id,
        mimeType,
        url: `/api/images/${id}`
    };
}

export async function readStoredImage(id) {
    if (!IMAGE_ID_PATTERN.test(id)) {
        throw new Error(
            "Invalid image identifier."
        );
    }

    const matchingFiles = await fs.readdir(
        IMAGE_DIRECTORY
    );

    const filename = matchingFiles.find(
        item => item.startsWith(`${id}.`)
    );

    if (!filename) {
        throw new Error(
            "Stored image was not found."
        );
    }

    const extension = path.extname(filename);
    const mimeType = Object.entries(IMAGE_TYPES)
        .find(([, value]) => value === extension)?.[0];

    if (!mimeType) {
        throw new Error(
            "Stored image type is invalid."
        );
    }

    const filePath = path.join(
        IMAGE_DIRECTORY,
        filename
    );

    return {
        mimeType,
        data: await fs.readFile(filePath)
    };
}

export async function deleteStoredImage(id) {
    if (!IMAGE_ID_PATTERN.test(id)) {
        return;
    }

    const matchingFiles = await fs.readdir(
        IMAGE_DIRECTORY
    );

    const filename = matchingFiles.find(
        item => item.startsWith(`${id}.`)
    );

    if (filename) {
        await fs.unlink(
            path.join(IMAGE_DIRECTORY, filename)
        );
    }
}