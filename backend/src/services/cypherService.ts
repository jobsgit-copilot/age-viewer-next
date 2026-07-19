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
import GraphRepository from '../models/GraphRepository.ts';

class CypherService {
    private _graphRepository: GraphRepository;

    constructor(graphRepository: GraphRepository) {
        this._graphRepository = graphRepository;
    }

    async executeCypher(query: string | undefined) {
        if (!query) {
            throw new Error('Query not entered!');
        } else {
            try {
                let resultSet = await this._graphRepository.execute(query);
                return this.createResult(resultSet);
            } catch (err) {
                throw err;
            }
        }
    }

    createResult(resultSet: any) {
        let result;

        let targetItem = resultSet;
        if (Array.isArray(resultSet)) {
            targetItem = resultSet[resultSet.length - 1];
        }

        let cypherRow = targetItem.rows;
        result = {
            rows: cypherRow,
            columns: this._getColumns(targetItem),
            rowCount: this._getRowCount(targetItem),
            command: this._getCommand(targetItem),
        };
        return result;
    }

    _getColumns(resultSet: { fields: Array<{ name: string }> }): string[] {
        return resultSet.fields.map((field) => field.name);
    }

    _getRowCount(resultSet: { rowCount: number | null }): number | null {
        return resultSet.rowCount;
    }

    _getCommand(resultSet: { command: string }): string {
        return resultSet.command;
    }
}

export default CypherService;
