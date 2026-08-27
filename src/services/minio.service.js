// src/services/minio.service.js

const Minio = require('minio');
const config = require('../config'); // adjust path if necessary

// Use config.minio or fall back to env vars
const minioConfig = config.minio || {
  endPoint: process.env.MINIO_ENDPOINT,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
  bucket: process.env.MINIO_BUCKET || 'scanner',
  publicBaseUrl: process.env.MINIO_PUBLIC_BASE_URL,
};

if (!minioConfig.endPoint || !minioConfig.accessKey || !minioConfig.secretKey || !minioConfig.publicBaseUrl) {
  throw new Error('MinIO configuration is incomplete. Check environment variables.');
}

const client = new Minio.Client({
  endPoint: minioConfig.endPoint,
  useSSL: minioConfig.useSSL,
  accessKey: minioConfig.accessKey,
  secretKey: minioConfig.secretKey,
});

/**
 * Ensure the bucket exists; create it if not.
 */
const ensureBucket = async () => {
  const exists = await client.bucketExists(minioConfig.bucket);
  if (!exists) {
    await client.makeBucket(minioConfig.bucket, 'us-east-1');
    console.log(`Bucket "${minioConfig.bucket}" created`);
  }
};

/**
 * Upload a buffer to MinIO.
 * @param {string} objectName - Key inside the bucket (e.g., 'folder/image.png')
 * @param {Buffer} buffer - File content
 * @param {object} metaData - Optional metadata (e.g., { 'Content-Type': 'image/png' })
 * @returns {Promise<string>} - Public URL of the uploaded object
 */
const uploadBuffer = async (objectName, buffer, metaData = {}) => {
  await ensureBucket();
  await client.putObject(minioConfig.bucket, objectName, buffer, buffer.length, metaData);
  return `${minioConfig.publicBaseUrl}/${objectName}`;
};

/**
 * Delete an object from MinIO.
 * @param {string} objectName - Key of the object to delete
 */
const deleteObject = async (objectName) => {
  await client.removeObject(minioConfig.bucket, objectName);
};

/**
 * List objects in the bucket, optionally filtered by prefix.
 * @param {string} prefix - Optional prefix (e.g., 'event_qrcodes')
 * @returns {Promise<Array>} - List of objects with metadata
 */
const listObjects = async (prefix = '') => {
  const objects = [];
  const stream = client.listObjects(minioConfig.bucket, prefix, true);
  return new Promise((resolve, reject) => {
    stream.on('data', obj => objects.push(obj));
    stream.on('end', () => resolve(objects));
    stream.on('error', reject);
  });
};

/**
 * Get object metadata.
 * @param {string} objectName - Key of the object
 * @returns {Promise<object>}
 */
const statObject = async (objectName) => {
  return await client.statObject(minioConfig.bucket, objectName);
};

module.exports = {
  client,
  uploadBuffer,
  deleteObject,
  listObjects,
  statObject,
  ensureBucket,
  config: minioConfig,
};