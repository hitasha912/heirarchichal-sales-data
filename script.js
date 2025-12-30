const width = 600;
const radius = width / 2;

const color = d3.scaleOrdinal(d3.schemeTableau10);

const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width)
    .attr("height", width)
    .append("g")
    .attr("transform", `translate(${radius},${radius})`);

const tooltip = d3.select("#tooltip");

const partition = d3.partition()
    .size([2 * Math.PI, radius]);

const arc = d3.arc()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    .innerRadius(d => d.y0)
    .outerRadius(d => d.y1);

const centerText = svg.append("text")
    .attr("id", "center-text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "16px")
    .style("font-weight", "600")
    .style("fill", "#444")
    .style("pointer-events", "none")
    .text("Sales Data");

let root;
let path;
let label;
let focus;

// LOAD DATA
d3.json("hierarchy_data.json").then(data => {

    root = d3.hierarchy(data)
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);
    focus = root;
    partition(root);
    root.each(d => d.current = d);

    //path
    path = svg.append("g")
        .selectAll("path")
        .data(root.descendants())
        .join("path")
        .attr("display", d => d.depth ? null : "none")
        .attr("d", d => arc(d.current))
        .attr("fill", d => {
            if (d.depth === 1) {
                return d3.color(color(d.data.name)).darker(0.4);
            }
            if (d.parent) {
                return d3.color(color(d.parent.data.name)).brighter(0.7);
            }
            return color(d.data.name);
        })
        .style("stroke", "#fff")
        .style("cursor", "pointer")
        .on("click", (event, d) => zoom(d));

    //label
    label = svg.append("g")
        .attr("pointer-events", "none")
        .attr("text-anchor", "middle")
        .style("fill", "#000")
        .selectAll("text")
        .data(root.descendants())
        .join("text")
        .attr("dy", "0.35em")
        .style("font-size", d => {
  const angle = d.current.x1 - d.current.x0;
  return angle > 0.25 ? "14px" : "11px";
})
        .text(d => d.depth >= 1 ? d.data.name : "")
        .each(function (d) {
            wrapText(d3.select(this), d.depth === 1 ? 80 : 60, 2);
        })
        .attr("transform", d => labelTransform(d))
        .style("opacity", d =>
            d.depth >= 1 && arcHasEnoughSpace(d) ? 1 : 0
        );

    //zoom out
    svg.append("circle")
        .attr("r", radius / 4)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("click", () => {
            if (focus.parent) {
                zoom(focus.parent);
            }
        });

    populateDropdown();
    populateParentDropdown();
    attachTooltip(path);
});


// ZOOM
function zoom(d) {

    focus = d;

    d3.select("#center-text")
        .transition()
        .duration(300)
        .style("opacity", d.depth === 0 ? 1 : 0);

    root.each(n => {
        n.target = {
            x0: Math.max(0, Math.min(1, (n.x0 - d.x0) / (d.x1 - d.x0))) * 2 * Math.PI,
            x1: Math.max(0, Math.min(1, (n.x1 - d.x0) / (d.x1 - d.x0))) * 2 * Math.PI,
            y0: Math.max(0, n.y0 - d.y0),
            y1: Math.max(0, n.y1 - d.y0)
        };
    });

    const t = svg.transition().duration(750);

    //animate arcs
    path.transition(t)
        .attrTween("d", d => {
            const i = d3.interpolate(d.current, d.target);
            return t => {
                d.current = i(t);
                return arc(d.current);
            };
        });

    //hide labels
    label.interrupt().style("opacity", 0);

    label.transition(t)
  .attrTween("transform", d => {
    const i = d3.interpolate(d.current, d.target);
    return t => labelTransform(i(t));
  })
  .on("end", function (d) {
    if (
      d.depth >= 1 &&
      isDescendant(focus, d) &&
      arcHasEnoughSpace(d)
    ) {
      const text = d3.select(this)
        .style("opacity", 1)
        .style("font-size", d.depth === 1 ? "14px" : "11px");

      wrapText(text, d.depth === 1 ? 80 : 60, 2);
    }
  });

}


// LABEL HALPERS

// Wrap Text
function wrapText(selection, maxWidth, maxLines = 2) {
    selection.each(function (d) {
        const text = d3.select(this);
        const words = d.data.name.split(/\s+/);
        text.text(null);

        let line = [];
        let lineNumber = 0;
        const lineHeight = 1.1;
        const y = 0;
        const dy = 0;

        let tspan = text.append("tspan")
            .attr("x", 0)
            .attr("y", y)
            .attr("dy", dy + "em");

        for (let i = 0; i < words.length; i++) {
            line.push(words[i]);
            tspan.text(line.join(" "));

            if (tspan.node().getComputedTextLength() > maxWidth) {
                line.pop();
                tspan.text(line.join(" "));

                line = [words[i]];
                lineNumber++;

                if (lineNumber >= maxLines) {
                    tspan.text(tspan.text() + "…");
                    break;
                }

                tspan = text.append("tspan")
                    .attr("x", 0)
                    .attr("y", y)
                    .attr("dy", lineNumber * lineHeight + dy + "em")
                    .text(words[i]);
            }
            const totalLength = text.node().getComputedTextLength();
            text.style("opacity", totalLength > maxWidth * maxLines ? 0 : 1);

        }

    });
}


// Label visible or not
function labelVisible(d) {
    return (
        isDescendant(focus, d) &&
        d.target.x1 > d.target.x0 &&
        d.target.y1 > d.target.y0
    );
}


// :abel Transform
function labelTransform(d) {
    const angle = (d.x0 + d.x1) / 2 * 180 / Math.PI;

    const radius = d.depth === 1
        ? d.y0 + (d.y1 - d.y0) * 0.55
        : (d.y0 + d.y1) / 2;

    return `
        rotate(${angle - 90})
        translate(${radius},0)
        rotate(${angle < 180 ? 0 : 180})
    `;
}


// Check
function isDescendant(parent, node) {
    return node === parent || node.ancestors().includes(parent);
}


// Percentage
function percentOfParent(d) {
    if (!d.parent) return 100;
    return ((d.value / d.parent.value) * 100).toFixed(0);
}

// Rank
function rank(d) {
    if (!d.parent) return 1;

    const siblings = d.parent.children
        .slice()
        .sort((a, b) => b.value - a.value);

    return siblings.findIndex(s => s === d) + 1;
}


// Dropdown for update
function populateDropdown() {
    const select = document.getElementById("categorySelect");
    select.innerHTML = "";

    const leaves = root.leaves()
        .map(d => d.data.name)
        .sort((a, b) => a.localeCompare(b)); 

    leaves.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });

    const firstLeaf = root.leaves().find(d => d.data.name === leaves[0]);
    if (firstLeaf) {
        document.getElementById("valueInput").value = firstLeaf.data.value;
    }
}



// New Category
function populateParentDropdown() {
    const select = document.getElementById("parentSelect");
    select.innerHTML = "";

    const parents = root.descendants()
        .filter(d => d.children)
        .map(d => d.data.name)
        .sort((a, b) => a.localeCompare(b));

    parents.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
}


// Input for update
function updateFromInput() {
    const selectedCategory = document.getElementById("categorySelect").value;
    const newValue = Number(document.getElementById("valueInput").value);

    const SAFE_MIN = 1; // keeps category alive

    root.each(d => {
        if (!d.children && d.data.name === selectedCategory) {
            d.data.value = Math.max(newValue, SAFE_MIN);
        }
    });

    root.sum(d => d.value);
    partition(root);
    zoom(root);
}


// Add New Category
function addNewCategory(parentName, newCategoryName, value) {

    const SAFE_MIN = 1;

    function findNode(node) {
        if (node.name === parentName) return node;
        if (!node.children) return null;

        for (const child of node.children) {
            const found = findNode(child);
            if (found) return found;
        }
        return null;
    }

    const parentDataNode = findNode(root.data);

    if (!parentDataNode) {
        alert("Parent category not found");
        return;
    }

    if (!parentDataNode.children) {
        parentDataNode.children = [];
    }

    // prevent duplicates
    if (parentDataNode.children.some(c => c.name === newCategoryName)) {
        alert("Category already exists");
        return;
    }

    // add new category
    parentDataNode.children.push({
        name: newCategoryName,
        value: Math.max(value, SAFE_MIN)
    });

    // Rebuild hierarchy and update paths
    root = d3.hierarchy(root.data)
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);

    partition(root);
    root.each(d => d.current = d);

    path = path
        .data(root.descendants(), d => d.data.name)
        .join(
            enter => enter.append("path")
                .attr("display", d => d.depth ? null : "none")
                .attr("fill", d => {
                    if (d.depth === 1) return color(d.data.name);
                    return d3.color(color(d.parent.data.name)).brighter(d.depth * 0.6);
                })
                .style("stroke", "#fff")
                .style("cursor", "pointer")
                .on("click", (event, d) => zoom(d))
                .attr("d", d => arc(d.current)),
            update => update,
            exit => exit.remove()
        );
    attachTooltip(path);

    // Update labels
    label = label
        .data(root.descendants(), d => d.data.name)
        .join(
            enter => enter.append("text")
                .attr("dy", "0.35em")
                .attr("fill", d => {
                    if (d.depth === 1) return color(d.data.name);
                    return d3.color(color(d.parent.data.name)).brighter(d.depth * 0.6);
                })
                .style("fill", "#000")
                .style("font-size", d => d.depth === 1 ? "12px" : "9px")
                .text(d => d.depth ? d.data.name : "")
                .attr("transform", d => labelTransform(d))
                .style("opacity", 1)
                .each(function (d) {
                    wrapText(
                        d3.select(this),
                        d.depth === 1 ? 80 : 60,
                        2
                    );
                }),
            update => update
                .text(d => d.depth ? d.data.name : "")
                .transition()
                .duration(750)
                .attr("transform", d => labelTransform(d))
                .style("opacity", 1)
                .on("end", function (d) {
                    wrapText(
                        d3.select(this),
                        d.depth === 1 ? 80 : 60,
                        2
                    );
                }),
            exit => exit.remove()
        );
    label.style("opacity", d =>
        d.depth >= 1 && arcHasEnoughSpace(d) ? 1 : 0
    );

    populateDropdown();
    populateParentDropdown();

    const parentNode = root.descendants()
        .find(d => d.data.name === parentName);
    zoom(parentNode || root);
}


// Labels to be visible after zoom
function labelVisibleInZoom(d) {
    return (
        isDescendant(focus, d) &&
        d.x1 > d.x0 &&
        d.y1 > d.y0
    );
}


// Arc space for label 
function arcHasEnoughSpace(d) {
    const angle = d.current.x1 - d.current.x0;
    const r = (d.current.y0 + d.current.y1) / 2;
    const arcLength = angle * r;

    const MIN_ARC_LENGTH = 30; 
    return arcLength > MIN_ARC_LENGTH;
}


// Tooltip updation
function attachTooltip(selection) {
    selection
        .on("mouseover", (event, d) => {
            tooltip
                .style("opacity", 1)
                .html(`
          <strong>${d.data.name}</strong><br>
          <strong>Sales</strong>: ₹${d.value.toLocaleString()}<br>
          <strong>Percentage</strong> : ${percentOfParent(d)}%<br>
          <strong>Rank</strong>: ${rank(d)}
        `);
        })
        .on("mousemove", event => {
            tooltip
                .style("left", event.pageX + 10 + "px")
                .style("top", event.pageY - 20 + "px");
        })
        .on("mouseout", () => {
            tooltip.style("opacity", 0);
        });
}


// BUTTONS

// Update
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("updateBtn")
        .addEventListener("click", updateFromInput);
});

document.getElementById("categorySelect")
    .addEventListener("change", e => {
        const selected = e.target.value;
        const node = root.leaves().find(d => d.data.name === selected);
        if (node) {
            document.getElementById("valueInput").value = node.data.value;
        }
    });

// Add category
document.getElementById("addCategoryBtn")
    .addEventListener("click", () => {
        const parent = document.getElementById("parentSelect").value;
        const name = document.getElementById("newCategoryInput").value.trim();
        const value = Number(document.getElementById("newCategoryValue").value);

        if (!name || isNaN(value)) {
            alert("Please enter a category name and value");
            return;
        }

        addNewCategory(parent, name, value);

        document.getElementById("newCategoryInput").value = "";
        document.getElementById("newCategoryValue").value = "";
    });

