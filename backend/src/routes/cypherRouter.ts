/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import express from "express";
import CypherController from "../controllers/cypherController.ts";
import multer from 'multer';
const storage = multer.memoryStorage();
const upload = multer({storage});
const router = express.Router();
const cypherController = new CypherController();

import { wrap } from '../common/Routes.ts';

// Execute Cypher Query
router.post("/", wrap(cypherController.executeCypher));
router.post("/init", upload.fields([{name:"edges"}, {name:"nodes"}]), wrap(cypherController.createGraph));
// v2-only parameterized endpoints (api-contract.md §10)
router.post("/neighbors", wrap(cypherController.getNeighbors));
router.post("/element/delete", wrap(cypherController.deleteElement));

export default router;
