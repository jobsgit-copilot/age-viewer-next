const getDelete = (ob: Record<string, unknown>, name: string): unknown => {
    const val = ob[name];
    delete ob[name];
    return val;
};
const toAgeProps = (data: Record<string, unknown>, empty = false): string => {
    let props: string[] = [];
    Object.entries(data).forEach(([k, v]) => {
        let val = typeof v === 'string' ? `'${v}'` : v;
        props.push(`${k}:${val}`);
    });
    if (!empty && Object.keys(data).length === 0) return '';
    return `{${props.join(', ')}}`;
}

export {
    getDelete,
    toAgeProps
}
