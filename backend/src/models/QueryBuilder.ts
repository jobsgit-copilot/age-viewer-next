

class QueryBuilder {
    _graphName?: string;
    ends: { start: string; end: string };
    clause: string;
    middle: string[];

    constructor({graphName, returnAs='x'}: {graphName?: string; returnAs?: string} = {}){
        this._graphName = graphName;
        this.ends = {
            start:`SELECT * FROM cypher('${this._graphName}', $$`,
            end:`$$) as (${returnAs} agtype);`
        };
        this.clause = '';
        this.middle = [];
    }

    startQuery(startQuery: string): void {
        this.ends.start = startQuery;
    }

    insertQuery(clause: string): void {
        this.middle.push(clause);
    }
    create(): void {
        this.clause = 'CREATE '
    }
    endQuery(endQuery: string): void {
        this.ends.end = endQuery;
    }

    getGeneratedQuery(): string {
        return ((
            this.ends.start +
            this.clause +
            this.middle.join(', ')+
            this.ends.end).trim());
    }
}

export default QueryBuilder;
