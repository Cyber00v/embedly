const properties = pluginContext.properties;
const locale =
  properties.locale === "ar" || properties.locale === "en"
    ? properties.locale
    : pluginContext.language;
const weekStartsOn = properties.weekStartsOn === "monday" ? 1 : 0;
const today = new Date();
const selectedDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value) {
  const match = selectedDatePattern.exec(String(value || ""));
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
    ? date
    : null;
}

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

let selectedDate = parseDate(properties.selectedDate);
const initialDate = selectedDate || today;
let visibleMonth = new Date(
  initialDate.getFullYear(),
  initialDate.getMonth(),
  1,
);
const monthLabel = root.querySelector("[data-calendar-month]");
const weekdayContainer = root.querySelector("[data-calendar-weekdays]");
const dayContainer = root.querySelector("[data-calendar-days]");
const selectedLabel = root.querySelector("[data-calendar-selected]");
const todayButton = root.querySelector("[data-calendar-today]");
const previousButton = root.querySelector("[data-calendar-previous]");
const nextButton = root.querySelector("[data-calendar-next]");
const messages =
  locale === "ar"
    ? {
        calendar: "التقويم",
        previousMonth: "الشهر السابق",
        nextMonth: "الشهر التالي",
        days: "أيام الشهر",
        selectDate: "اختر تاريخاً",
        noDateSelected: "لم يتم اختيار تاريخ",
        today: "اليوم",
      }
    : {
        calendar: "Calendar",
        previousMonth: "Previous month",
        nextMonth: "Next month",
        days: "Days",
        selectDate: "Select a date",
        noDateSelected: "No date selected",
        today: "Today",
      };
const configuredCalendarTitle = String(properties.title || "").trim();
const calendarTitle =
  locale === "ar" && configuredCalendarTitle === "Select a date"
    ? messages.selectDate
    : configuredCalendarTitle || messages.selectDate;
root.querySelector(".calendar").setAttribute("aria-label", messages.calendar);
root.querySelector("[data-calendar-title]").textContent = calendarTitle;
previousButton.setAttribute("aria-label", messages.previousMonth);
nextButton.setAttribute("aria-label", messages.nextMonth);
dayContainer.setAttribute("aria-label", messages.days);
todayButton.setAttribute("aria-label", messages.today);
const monthFormatter = new Intl.DateTimeFormat(locale, {
  month: "long",
  year: "numeric",
});
const fullDateFormatter = new Intl.DateTimeFormat(locale, {
  dateStyle: "long",
});
const weekdayFormatter = new Intl.DateTimeFormat(locale, {
  weekday: "short",
});

function renderWeekdays() {
  weekdayContainer.replaceChildren();
  for (let index = 0; index < 7; index += 1) {
    const weekday = document.createElement("span");
    const date = new Date(2023, 0, 1 + weekStartsOn + index);
    weekday.className = "calendar-weekday";
    weekday.textContent = weekdayFormatter.format(date);
    weekdayContainer.append(weekday);
  }
}

function renderDays() {
  dayContainer.replaceChildren();
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDayOffset =
    (new Date(year, month, 1).getDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7;
  monthLabel.textContent = monthFormatter.format(visibleMonth);

  for (let index = 0; index < cellCount; index += 1) {
    const day = index - firstDayOffset + 1;
    if (day < 1 || day > daysInMonth) {
      const empty = document.createElement("span");
      empty.className = "calendar-empty";
      empty.setAttribute("role", "gridcell");
      empty.setAttribute("aria-hidden", "true");
      dayContainer.append(empty);
      continue;
    }

    const date = new Date(year, month, day);
    const key = dateKey(date);
    const button = document.createElement("button");
    button.className = "calendar-day";
    button.type = "button";
    button.setAttribute("role", "gridcell");
    button.setAttribute(
      "aria-pressed",
      String(key === dateKey(selectedDate || new Date(0))),
    );
    button.setAttribute("aria-label", fullDateFormatter.format(date));
    button.dataset.calendarDate = key;
    button.textContent = String(day);
    if (key === dateKey(today)) button.classList.add("is-today");
    if (selectedDate && key === dateKey(selectedDate))
      button.classList.add("is-selected");
    dayContainer.append(button);
  }

  selectedLabel.textContent = selectedDate
    ? fullDateFormatter.format(selectedDate)
    : messages.noDateSelected;
  todayButton.hidden = !properties.showToday;
  todayButton.textContent = messages.today;
}

function selectDate(date) {
  selectedDate = date;
  const key = dateKey(date);
  pluginContext.setProperty("selectedDate", key);
  pluginContext.emit("onDaySelected", {
    date: key,
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
  renderDays();
}

function onClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const dayButton = target.closest("[data-calendar-date]");
  if (dayButton) {
    selectDate(parseDate(dayButton.dataset.calendarDate));
    return;
  }
  if (target.closest("[data-calendar-previous]")) {
    visibleMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() - 1,
      1,
    );
    renderDays();
    pluginContext.emit("onMonthChanged", {
      year: visibleMonth.getFullYear(),
      month: visibleMonth.getMonth() + 1,
    });
    return;
  }
  if (target.closest("[data-calendar-next]")) {
    visibleMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      1,
    );
    renderDays();
    pluginContext.emit("onMonthChanged", {
      year: visibleMonth.getFullYear(),
      month: visibleMonth.getMonth() + 1,
    });
    return;
  }
  if (target.closest("[data-calendar-today]")) {
    visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    selectDate(today);
  }
}

root.addEventListener("click", onClick);
renderWeekdays();
renderDays();

pluginContext.exposeFunction("selectDate", (dateInput) => {
  const parsedDate =
    dateInput instanceof Date ? dateInput : new Date(dateInput);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid date provided: ${dateInput}`);
  }

  return selectDate(parsedDate);
});

return () => root.removeEventListener("click", onClick);
