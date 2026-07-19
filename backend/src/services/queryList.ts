import fs from 'node:fs/promises';
import papa from 'papaparse';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

const readCSV = (file: string, resolve: (results: papa.ParseResult<unknown>) => void, reject: (err: unknown) => void)=>{
    return papa.parse(file, {
        skipEmptyLines:true,
        transform:(val: string, col: string | number): any =>{
            if (col !== 0) return val;

        },
        complete:(results)=>{
            resolve(results as papa.ParseResult<unknown>);
        },
        error:(err: Error)=>{
            reject(err);
        },
    });
}
const getQueryList = async (req: Request, res: Response, next: NextFunction)=>{
    const p = path.join(import.meta.dirname, "../../misc/graph_kw.csv");
    const file = await fs.readFile(p, {
        encoding: 'utf-8'
    });

    const results = await new Promise<papa.ParseResult<unknown>>((resolve, reject)=>{
        readCSV(file, resolve, reject);
    });

    const kwResults = {
        kw:(results.data[0] as unknown[]).splice(1),
        relationships:results.data.slice(1)
    }
    res.status(200).json(kwResults).end();

}
export default getQueryList;
