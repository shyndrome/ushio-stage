//tokusho-btn
$(function() {
    $(".tokusho_btn").click(function() {
        $(".tokusho_text").toggleClass("is-active");
    });
});

// header_fetch_target
fetch('header.html')
    .then(response => response.text())
    .then(data => {
    document.getElementById('header_fetch_target').innerHTML = data;
    }
);