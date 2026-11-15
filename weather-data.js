// NOAA Global Hourly Central Park observations. AA1 stores the accumulation
// period in hours and the measured depth in tenths of a millimeter.
// These records end at 11:51 PM EDT, four minutes after the story opens.
(() => {
  const records = [
    {
      id: 'dry',
      label: 'Dry hour',
      localTime: '2023-09-11T23:51:00-04:00',
      utc: '2023-09-12T03:51:00Z',
      precipitationMm: 0,
      durationHours: 1,
      rawAA1: '01,0000,9,5',
    },
    {
      id: 'light',
      label: 'Light rain',
      localTime: '2023-09-17T23:51:00-04:00',
      utc: '2023-09-18T03:51:00Z',
      precipitationMm: .3,
      durationHours: 1,
      rawAA1: '01,0003,9,5',
    },
    {
      id: 'heavy',
      label: 'Steadier rain',
      localTime: '2023-09-10T23:51:00-04:00',
      utc: '2023-09-11T03:51:00Z',
      precipitationMm: 5.1,
      durationHours: 1,
      rawAA1: '01,0051,9,5',
    },
  ];

  window.LaundryWeather = Object.freeze({
    records: Object.freeze(records.map(Object.freeze)),
    defaultId: 'heavy',
    station: 'Central Park, New York',
    stationId: '72505394728',
    sourceName: 'NOAA Global Hourly (ISD)',
    sourceUrl: 'https://noaa-global-hourly-pds.s3.amazonaws.com/2023/72505394728.csv',
    formatUrl: 'https://www.ncei.noaa.gov/pub/data/noaa/isd-format-document.pdf',
  });
})();
