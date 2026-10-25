-- One company's details (header of the /search comparison).  $1 = ticker
SELECT cik, ticker, name, sector, industry, description
FROM companies
WHERE ticker = $1;
