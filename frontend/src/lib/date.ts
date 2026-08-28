const dateOptions: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const dateTimeOptions: Intl.DateTimeFormatOptions = {
  ...dateOptions,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

export const formatDate = (value: string | Date) =>
  new Intl.DateTimeFormat("en-GB", dateOptions).format(
    typeof value === "string" ? new Date(value) : value,
  );

export const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat("en-GB", dateTimeOptions).format(
    typeof value === "string" ? new Date(value) : value,
  );
