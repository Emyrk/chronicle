CREATE TABLE dbc_spell_description_variables (
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    id         INT  NOT NULL,
    variables  TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (dataset_id, id)
);
