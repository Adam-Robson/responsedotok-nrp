import http from 'node:http';
import type { Duplex } from 'node:stream';
import { httpHandler } from '../handlers/http-handler.js';
import { httpsHandler } from '../handlers/https-handler.js';